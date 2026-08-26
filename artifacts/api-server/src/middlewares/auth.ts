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

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
  avatarUrl: string | null;
  createdAt: Date;
}

const managerRoles = new Set(["owner", "administrator", "manager", "super_admin"]);

export function isManagerRole(role: string): boolean {
  return managerRoles.has(role);
}

export async function getLicenseFailure(tenantId: string): Promise<string | null> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return "Business account not found";
  if (tenant.licenseStatus !== "valid") return "Violet license is not valid";
  if (tenant.licenseValidUntil && tenant.licenseValidUntil <= new Date()) {
    return "Violet license has expired";
  }
  if (tenant.status === "suspended" || tenant.status === "expired") {
    return "Business account is not active";
  }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);
  if (!subscription) return "No active Violet license was found";

  const [plan] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.id, subscription.planId))
    .limit(1);

  const isMonthly = plan?.billingType === "monthly";
  const paymentOverdue =
    subscription.paymentStatus === "past_due" ||
    subscription.paymentStatus === "failed" ||
    (isMonthly && Boolean(subscription.currentPeriodEnd && subscription.currentPeriodEnd <= new Date()));
  const inactiveSubscription = ["expired", "cancelled"].includes(subscription.status);

  if (paymentOverdue || inactiveSubscription) {
    return "Your monthly Violet payment is overdue. Update billing on the Violet website to continue.";
  }

  return null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
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
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const licenseFailure = await getLicenseFailure(user.tenantId);
    if (licenseFailure) {
      res.status(402).json({ error: licenseFailure });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: user.createdAt,
    };
    req.tenantId = user.tenantId;
    next();
  } catch (err) {
    req.log.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal server error" });
  }
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
    const sessionToken = req.headers.authorization?.slice(7) ?? "";
    const managerAccessToken = req.header("x-violet-manager-access");

    if (!managerAccessToken || !req.tenantId || !hasValidManagerAccess(managerAccessToken, sessionToken, req.tenantId)) {
      res.status(403).json({ error: "Manager access required" });
      return;
    }

    next();
  });
}
