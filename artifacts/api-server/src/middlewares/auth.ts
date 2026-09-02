import type { Request, Response, NextFunction } from "express";
import {
  db,
  sessionsTable,
  usersTable,
  tenantsTable,
  plansTable,
  subscriptionsTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { hasValidManagerAccess } from "../lib/manager-access";
import { refreshWhopMembershipIfStale, WhopBindingError } from "../lib/subscriptionSync";
import {
  isSelfHostedRuntime,
  revalidateHostedLicense,
  shouldRevalidateRemoteLicense,
  syncLocalLicenseSnapshot,
} from "../lib/remoteLicense";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
}

interface LicenseCheckOptions {
  forceOnline?: boolean;
}

const managerRoles = new Set(["owner", "administrator", "manager", "super_admin"]);
const MAX_TRANSIENT_WHOP_STALENESS_MS = 6 * 60 * 60 * 1000;

export function isManagerRole(role: string): boolean {
  return managerRoles.has(role);
}

export function isSuperAdmin(user?: Pick<AuthUser, "role"> | null): boolean {
  return user?.role === "super_admin";
}

export async function getLicenseFailure(
  tenantId: string,
  options: LicenseCheckOptions = {},
): Promise<string | null> {
  let [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return "Business account not found";
  if (tenant.status === "suspended") {
    return "Business account is not active";
  }

  let [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);
  if (!subscription) return "No active Violet license was found";

  if (subscription.whopMembershipId) {
    try {
      await refreshWhopMembershipIfStale(
        tenantId,
        options.forceOnline ? null : subscription.lastWhopSyncAt,
        options.forceOnline ? 0 : undefined,
      );
      [tenant] = await db
        .select()
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      [subscription] = await db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.tenantId, tenantId))
        .limit(1);
    } catch (err) {
      console.warn("Unable to refresh Whop membership status", {
        tenantId,
        message: err instanceof Error ? err.message : "Unknown error",
      });
      const statusCode =
        typeof err === "object" &&
        err !== null &&
        "statusCode" in err &&
        typeof err.statusCode === "number"
          ? err.statusCode
          : null;
      const permanentVerificationFailure =
        err instanceof WhopBindingError ||
        statusCode === 401 ||
        statusCode === 403 ||
        statusCode === 404;
      const lastVerifiedAt = subscription.lastWhopSyncAt?.getTime() ?? 0;
      const verificationTooOld =
        !lastVerifiedAt || Date.now() - lastVerifiedAt > MAX_TRANSIENT_WHOP_STALENESS_MS;
      if (options.forceOnline || permanentVerificationFailure || verificationTooOld) {
        return "Violet could not verify this paid license with Whop. Open Subscription to restore access.";
      }
    }
  }

  if (!tenant || !subscription) return "No active Violet license was found";
  if (tenant.licenseStatus !== "valid") return "Violet license is not valid";
  if (tenant.licenseValidUntil && tenant.licenseValidUntil <= new Date()) {
    return "Violet license has expired";
  }
  if (tenant.status === "expired") {
    return "Business account is not active";
  }

  const [plan] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.id, subscription.planId))
    .limit(1);

  const isMonthly = plan?.billingType === "monthly";
  const paymentOverdue =
    subscription.paymentStatus === "past_due" ||
    subscription.paymentStatus === "failed" ||
    subscription.paymentStatus === "refunded" ||
    (isMonthly && Boolean(subscription.currentPeriodEnd && subscription.currentPeriodEnd <= new Date()));
  const inactiveSubscription = ["expired", "cancelled"].includes(subscription.status);

  if (paymentOverdue || inactiveSubscription) {
    return "Your Violet payment needs attention. Open Subscription to restore access.";
  }

  return null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
      licenseSessionToken?: string;
      licenseValidatedAt?: Date | null;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authenticated = await authenticateSession(req, res);
  if (!authenticated) return;
  if (req.user?.mustChangePassword) {
    res.status(403).json({ error: "Password change required" });
    return;
  }

  let licenseFailure: string | null = null;
  if (isSelfHostedRuntime()) {
    if (!req.licenseSessionToken) {
      licenseFailure = "Online license validation is required. Sign in again with an internet connection.";
    } else if (!shouldRevalidateRemoteLicense(req.licenseValidatedAt ?? null)) {
      licenseFailure = null;
    } else {
      try {
        const snapshot = await revalidateHostedLicense(req.licenseSessionToken);
        await syncLocalLicenseSnapshot(req.tenantId!, snapshot);
        licenseFailure = null;
        await db
          .update(sessionsTable)
          .set({ licenseValidatedAt: new Date() })
          .where(eq(sessionsTable.token, req.headers.authorization!.slice(7)));
      } catch (err) {
        licenseFailure = err instanceof Error
          ? err.message
          : "Violet could not verify this license online.";
      }
    }
  } else if (!isSuperAdmin(req.user)) {
    licenseFailure = await getLicenseFailure(req.tenantId!);
  }
  if (licenseFailure) {
    res.status(402).json({ error: licenseFailure });
    return;
  }

  next();
}

async function authenticateSession(req: Request, res: Response): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  const token = authHeader.slice(7);
  const now = new Date();

  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, now)))
      .limit(1);

    if (!session) {
      res.status(401).json({ error: "Invalid or expired session" });
      return false;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);

    if (!user || user.isActive !== "true") {
      res.status(401).json({ error: "User not found" });
      return false;
    }

    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl ?? null,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    };
    req.tenantId = user.tenantId;
    req.licenseSessionToken = session.licenseToken ?? undefined;
    req.licenseValidatedAt = session.licenseValidatedAt;
    return true;
  } catch (err) {
    req.log.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal server error" });
    return false;
  }
}

export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authenticated = await authenticateSession(req, res);
  if (!authenticated) return;
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    if (req.user?.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

export async function requireManagerAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (isSuperAdmin(req.user)) {
      next();
      return;
    }

    const sessionToken = req.headers.authorization?.slice(7) ?? "";
    const managerAccessToken = req.header("x-violet-manager-access");

    if (!managerAccessToken || !req.tenantId || !hasValidManagerAccess(managerAccessToken, sessionToken, req.tenantId)) {
      res.status(403).json({ error: "Manager access required" });
      return;
    }

    next();
  });
}
