import { Router } from "express";
import { db, tenantsTable, usersTable, sessionsTable, plansTable, subscriptionsTable, settingsTable } from "@workspace/db";
import {
  ConfirmManagerPasswordBody,
  ConfirmManagerPasswordResponse,
  UnlockManagerAccessBody,
  UnlockManagerAccessResponse,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken } from "../lib/crypto";
import { getLicenseFailure, isManagerRole, requireAuth } from "../middlewares/auth";
import { issueManagerAccess } from "../lib/manager-access";

const router = Router();

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const { businessName, email, password, firstName, lastName } = req.body;
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
      createdAt: user.createdAt.toISOString(),
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      status: tenant.status,
      planId: tenant.planId ?? "",
      planName: freePlan?.name ?? "Free",
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

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
  const [plan] = tenant?.planId
    ? await db.select().from(plansTable).where(eq(plansTable.id, tenant.planId)).limit(1)
    : [null];

  if (!tenant) {
    res.status(401).json({ error: "Business account not found" });
    return;
  }

  const licenseFailure = await getLicenseFailure(tenant.id);
  if (licenseFailure) {
    res.status(402).json({ error: licenseFailure });
    return;
  }

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });

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
      createdAt: user.createdAt.toISOString(),
    },
    tenant: {
      id: tenant?.id ?? "",
      name: tenant?.name ?? "",
      email: tenant?.email ?? "",
      status: tenant?.status ?? "active",
      planId: tenant?.planId ?? "",
      planName: plan?.name ?? "Free",
      createdAt: tenant?.createdAt?.toISOString() ?? new Date().toISOString(),
    },
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

  if (!manager || !isManagerRole(manager.role) || !verifyPassword(password, manager.passwordHash)) {
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

  if (!manager || !isManagerRole(manager.role) || !verifyPassword(body.data.password, manager.passwordHash)) {
    res.status(401).json({ error: "Manager credentials were not accepted" });
    return;
  }

  res.json(ConfirmManagerPasswordResponse.parse({ success: true }));
});

// POST /auth/logout
router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
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
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
