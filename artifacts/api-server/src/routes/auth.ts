import { Router } from "express";
import { db, tenantsTable, usersTable, sessionsTable, plansTable, subscriptionsTable, settingsTable, storesTable, registersTable } from "@workspace/db";
import {
  ConfirmManagerPasswordBody,
  ConfirmManagerPasswordResponse,
  UnlockManagerAccessBody,
  UnlockManagerAccessResponse,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken } from "../lib/crypto";
import { getLicenseFailure, isManagerRole, requireAuth, requireSession } from "../middlewares/auth";
import { issueManagerAccess } from "../lib/manager-access";
import { isPaidTier } from "../lib/subscriptionSync";
import {
  isSelfHostedRuntime,
  syncLocalLicenseSnapshot,
  verifyHostedLicenseCredentials,
} from "../lib/remoteLicense";

const router = Router();

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  if (isSelfHostedRuntime()) {
    res.status(403).json({
      error: "Create your Violet account in the hosted application before signing in to a self-hosted installation.",
    });
    return;
  }

  const { businessName, email, password, firstName, lastName } = req.body;
  const requestedPaidTier = isPaidTier(req.body?.requestedPaidTier)
    ? req.body.requestedPaidTier
    : null;
  if (!businessName || !email || !password || !firstName || !lastName) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  // Check email uniqueness
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  // Get free plan
  const [freePlan] = await db.select().from(plansTable).where(eq(plansTable.tier, "free")).limit(1);

  // Create tenant
  const [tenant] = await db.insert(tenantsTable).values({
    name: businessName,
    email,
    status: "active",
    planId: freePlan?.id ?? undefined,
    licenseStatus: "valid",
    licenseValidatedAt: new Date(),
    pendingPaidSignup: Boolean(requestedPaidTier),
    pendingPaidSignupExpiresAt: requestedPaidTier
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : null,
  }).returning();

  // Create user (owner)
  const passwordHash = hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    tenantId: tenant.id,
    email,
    passwordHash,
    firstName,
    lastName,
    role: "owner",
  }).returning();

  // Create subscription
  if (freePlan) {
    await db.insert(subscriptionsTable).values({
      tenantId: tenant.id,
      planId: freePlan.id,
      status: "active",
      paymentStatus: "not_required",
      currentPeriodStart: new Date(),
    });
  }

  // Create default settings
  await db.insert(settingsTable).values({
    tenantId: tenant.id,
    businessName,
    businessEmail: email,
  });

  // New tenants receive a usable operating hierarchy. Existing tenants retain
  // null attribution until an administrator deliberately assigns a store.
  const [store] = await db.insert(storesTable).values({
    tenantId: tenant.id, code: "MAIN", name: "Main Store",
  }).returning();
  await db.insert(registersTable).values({
    tenantId: tenant.id, storeId: store.id, code: "REG-1", name: "Register 1",
  });

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl ?? null,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      status: tenant.status,
      planId: tenant.planId ?? "",
      planName: freePlan?.name ?? "Free",
      requiresBillingAction: false,
      billingMessage: null,
      createdAt: tenant.createdAt.toISOString(),
    },
  });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (!user || user.isActive !== "true" || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  let [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);

  if (!tenant) {
    res.status(401).json({ error: "Business account not found" });
    return;
  }

  let licenseFailure: string | null = null;
  let remoteLicenseToken: string | undefined;
  let remoteLicenseValidatedAt: Date | undefined;
  if (isSelfHostedRuntime()) {
    try {
      const remoteLicense = await verifyHostedLicenseCredentials(email, password);
      await syncLocalLicenseSnapshot(tenant.id, remoteLicense);
      remoteLicenseToken = remoteLicense.licenseSessionToken;
      remoteLicenseValidatedAt = new Date();
      [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : 503;
      res.status(statusCode).json({
        error: error instanceof Error
          ? error.message
          : "An internet connection is required to verify this Violet account.",
      });
      return;
    }
  } else if (user.role !== "super_admin") {
    licenseFailure = await getLicenseFailure(tenant.id);
  }
  [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
  const [plan] = tenant?.planId
    ? await db.select().from(plansTable).where(eq(plansTable.id, tenant.planId)).limit(1)
    : [null];

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({
    userId: user.id,
    token,
    expiresAt,
    licenseToken: remoteLicenseToken,
    licenseValidatedAt: remoteLicenseValidatedAt,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl ?? null,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
    },
    tenant: {
      id: tenant?.id ?? "",
      name: tenant?.name ?? "",
      email: tenant?.email ?? "",
      status: tenant?.status ?? "active",
      planId: tenant?.planId ?? "",
      planName: plan?.name ?? "Free",
      requiresBillingAction: Boolean(licenseFailure),
      billingMessage: licenseFailure,
      createdAt: tenant?.createdAt?.toISOString() ?? new Date().toISOString(),
    },
  });
});

// POST /auth/change-password
router.post("/auth/change-password", requireSession, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 10) {
    res.status(400).json({ error: "Current password and a new password of at least 10 characters are required" });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: "The new password must be different" });
    return;
  }

  const user = req.user!;
  const [storedUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!storedUser || !verifyPassword(currentPassword, storedUser.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const [updated] = await db.update(usersTable).set({
    passwordHash: hashPassword(newPassword),
    mustChangePassword: false,
  }).where(eq(usersTable.id, user.id)).returning();

  res.json({
    id: updated.id,
    email: updated.email,
    firstName: updated.firstName,
    lastName: updated.lastName,
    role: updated.role,
    tenantId: updated.tenantId,
    avatarUrl: updated.avatarUrl ?? null,
    mustChangePassword: updated.mustChangePassword,
    createdAt: updated.createdAt.toISOString(),
  });
});

// POST /auth/manager-unlock
router.post("/auth/manager-unlock", requireAuth, async (req, res): Promise<void> => {
  const body = UnlockManagerAccessBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const { email, password } = body.data;

  const [manager] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, req.tenantId!), eq(usersTable.email, email.trim())))
    .limit(1);

  if (!manager || manager.isActive !== "true" || !isManagerRole(manager.role) || !verifyPassword(password, manager.passwordHash)) {
    res.status(401).json({ error: "Manager credentials were not accepted" });
    return;
  }

  const sessionToken = req.headers.authorization?.slice(7) ?? "";
  const grant = issueManagerAccess(sessionToken, req.tenantId!);
  res.json(UnlockManagerAccessResponse.parse({
    accessToken: grant.accessToken,
    expiresAt: grant.expiresAt.toISOString(),
  }));
});

// POST /auth/manager-confirmation — one-time manager password check for protected POS actions.
router.post("/auth/manager-confirmation", requireAuth, async (req, res): Promise<void> => {
  const body = ConfirmManagerPasswordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [manager] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, req.tenantId!), eq(usersTable.email, body.data.email.trim())))
    .limit(1);

  if (!manager || manager.isActive !== "true" || !isManagerRole(manager.role) || !verifyPassword(body.data.password, manager.passwordHash)) {
    res.status(401).json({ error: "Manager credentials were not accepted" });
    return;
  }

  res.json(ConfirmManagerPasswordResponse.parse({ success: true }));
});

// POST /auth/logout
router.post("/auth/logout", requireSession, async (req, res): Promise<void> => {
  const token = req.headers.authorization?.slice(7) ?? "";
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  res.json({ success: true });
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantId: user.tenantId,
    avatarUrl: user.avatarUrl ?? null,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
