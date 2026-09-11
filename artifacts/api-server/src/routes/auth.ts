import { Router } from "express";
import { db, tenantsTable, usersTable, sessionsTable, plansTable, subscriptionsTable, settingsTable, storesTable, registersTable } from "@workspace/db";
import {
  ConfirmManagerPasswordBody,
  ConfirmManagerPasswordResponse,
  UnlockManagerAccessBody,
  UnlockManagerAccessResponse,
} from "@workspace/api-zod";
import { eq, and, gt } from "drizzle-orm";
import {
  hashEmailVerificationToken,
  hashPassword,
  hashPasswordResetToken,
  verifyPassword,
  generateToken,
} from "../lib/crypto";
import { getLicenseFailure, isManagerRole, requireAuth, requireSession } from "../middlewares/auth";
import { issueManagerAccess } from "../lib/manager-access";
import { isPaidTier } from "../lib/subscriptionSync";
import {
  changeHostedPassword,
  ensureLocalDataStoreAvailable,
  isSelfHostedRuntime,
  LOCAL_DATA_STORE_ERROR_CODE,
  LOCAL_DATA_STORE_RECOVERY_MESSAGE,
  applyOfflineLicenseFallback,
  requestHostedPasswordReset,
  syncLocalLicenseSnapshot,
  verifyHostedLicenseCredentials,
} from "../lib/remoteLicense";
import { sendPasswordResetEmail } from "../lib/password-reset-email";
import { sendEmailVerificationEmail } from "../lib/email-verification";
import { ensureTenantLicense } from "../lib/entitlements";

const router = Router();
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

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
  const normalizedEmail = String(email).trim().toLowerCase();

  // Check email uniqueness
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = hashPassword(password);
  let registered: {
    tenant: typeof tenantsTable.$inferSelect;
    user: typeof usersTable.$inferSelect;
    freePlan: typeof plansTable.$inferSelect;
    verificationToken: string;
  };
  try {
    registered = await db.transaction(async (tx) => {
      const [freePlan] = await tx.select().from(plansTable).where(eq(plansTable.tier, "free")).limit(1);
      if (!freePlan) {
        throw Object.assign(new Error("Free plan is not configured."), { statusCode: 503 });
      }

      const now = new Date();
      const verificationToken = generateToken();
      const [tenant] = await tx.insert(tenantsTable).values({
        name: businessName,
        email: normalizedEmail,
        status: "active",
        planId: freePlan.id,
        licenseStatus: "valid",
        licenseValidatedAt: now,
        pendingPaidSignup: Boolean(requestedPaidTier),
        pendingPaidSignupExpiresAt: requestedPaidTier
          ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
          : null,
      }).returning();

      const [user] = await tx.insert(usersTable).values({
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        role: "owner",
        emailVerifiedAt: null,
        emailVerificationTokenHash: hashEmailVerificationToken(verificationToken),
        emailVerificationExpiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
      }).returning();

      await tx.insert(subscriptionsTable).values({
        tenantId: tenant.id,
        planId: freePlan.id,
        status: "active",
        paymentStatus: "not_required",
        currentPeriodStart: now,
      });
      await ensureTenantLicense(tenant.id, tx);

      await tx.insert(settingsTable).values({
        tenantId: tenant.id,
        businessName,
        businessEmail: normalizedEmail,
      });

      const [store] = await tx.insert(storesTable).values({
        tenantId: tenant.id, code: "MAIN", name: "Main Store",
      }).returning();
      await tx.insert(registersTable).values({
        tenantId: tenant.id, storeId: store.id, code: "REG-1", name: "Register 1",
      });

      return { tenant, user, freePlan, verificationToken };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(400).json({ error: "Email already registered" });
      return;
    }
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : "Unable to create the account right now.",
    });
    return;
  }

  const { tenant, user, freePlan, verificationToken } = registered;
  let verificationEmailSent = true;
  try {
    await sendEmailVerificationEmail(user.email, verificationToken, requestedPaidTier);
  } catch (error) {
    verificationEmailSent = false;
    req.log.error({ err: error }, "Email verification delivery failed after registration");
  }

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl ?? null,
      mustChangePassword: user.mustChangePassword,
      emailVerifiedAt: user.emailVerifiedAt,
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
    email: user.email,
    verificationRequired: true,
    verificationEmailSent,
  });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  if (isSelfHostedRuntime()) {
    try {
      await ensureLocalDataStoreAvailable();
    } catch {
      res.status(503).json({
        code: LOCAL_DATA_STORE_ERROR_CODE,
        error: LOCAL_DATA_STORE_RECOVERY_MESSAGE,
      });
      return;
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (!user || user.isActive !== "true") {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const localPasswordMatches = verifyPassword(password, user.passwordHash);
  if (!isSelfHostedRuntime() && !localPasswordMatches) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (!isSelfHostedRuntime() && !user.emailVerifiedAt) {
    res.status(403).json({
      code: "EMAIL_NOT_VERIFIED",
      email: user.email,
      error: "Verify your email address before signing in.",
    });
    return;
  }
  if (isSelfHostedRuntime() && user.role === "super_admin") {
    res.status(403).json({
      error: "Super administrator access is only available on hosted Violet",
    });
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
      if (!localPasswordMatches) {
        [user] = await db.update(usersTable).set({
          passwordHash: hashPassword(password),
          mustChangePassword: false,
        }).where(eq(usersTable.id, user.id)).returning();
      }
      [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    } catch (error) {
      if (localPasswordMatches) {
        try {
          licenseFailure = await applyOfflineLicenseFallback(tenant.id);
          remoteLicenseToken = undefined;
          remoteLicenseValidatedAt = undefined;
        } catch (fallbackError) {
          res.status(503).json({
            error: fallbackError instanceof Error
              ? fallbackError.message
              : "The local Violet license cache could not be used.",
          });
          return;
        }
      } else {
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
      emailVerifiedAt: user.emailVerifiedAt,
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

// POST /auth/verify-email
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  if (isSelfHostedRuntime()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    res.status(400).json({ error: "This email verification link is invalid or expired." });
    return;
  }

  const tokenHash = hashEmailVerificationToken(token);
  const now = new Date();
  const verified = await db.transaction(async (tx) => {
    const [pendingUser] = await tx.select().from(usersTable).where(and(
      eq(usersTable.emailVerificationTokenHash, tokenHash),
      gt(usersTable.emailVerificationExpiresAt, now),
      eq(usersTable.isActive, "true"),
    )).limit(1);
    if (!pendingUser) return null;

    const [user] = await tx.update(usersTable).set({
      emailVerifiedAt: now,
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    }).where(eq(usersTable.id, pendingUser.id)).returning();
    const [tenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    if (!tenant) return null;
    const [plan] = tenant.planId
      ? await tx.select().from(plansTable).where(eq(plansTable.id, tenant.planId)).limit(1)
      : [null];
    const sessionToken = generateToken();
    await tx.insert(sessionsTable).values({
      userId: user.id,
      token: sessionToken,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });
    return { user, tenant, plan, sessionToken };
  });

  if (!verified) {
    res.status(400).json({ error: "This email verification link is invalid or expired." });
    return;
  }

  res.json({
    token: verified.sessionToken,
    user: {
      id: verified.user.id,
      email: verified.user.email,
      firstName: verified.user.firstName,
      lastName: verified.user.lastName,
      role: verified.user.role,
      tenantId: verified.user.tenantId,
      avatarUrl: verified.user.avatarUrl ?? null,
      mustChangePassword: verified.user.mustChangePassword,
      emailVerifiedAt: verified.user.emailVerifiedAt,
      createdAt: verified.user.createdAt.toISOString(),
    },
    tenant: {
      id: verified.tenant.id,
      name: verified.tenant.name,
      email: verified.tenant.email,
      status: verified.tenant.status,
      planId: verified.tenant.planId ?? "",
      planName: verified.plan?.name ?? "Free",
      requiresBillingAction: false,
      billingMessage: null,
      createdAt: verified.tenant.createdAt.toISOString(),
    },
  });
});

// POST /auth/resend-verification
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(and(
    eq(usersTable.email, email),
    eq(usersTable.isActive, "true"),
  )).limit(1);
  let verificationEmailSent = false;
  if (user && !user.emailVerifiedAt) {
    const token = generateToken();
    await db.update(usersTable).set({
      emailVerificationTokenHash: hashEmailVerificationToken(token),
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    }).where(eq(usersTable.id, user.id));
    try {
      await sendEmailVerificationEmail(user.email, token);
      verificationEmailSent = true;
    } catch (error) {
      req.log.error({ err: error }, "Email verification resend delivery failed");
    }
  }

  res.json({ success: true, verificationEmailSent });
});

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_ACCEPTED = { success: true };

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  if (isSelfHostedRuntime()) {
    try {
      await requestHostedPasswordReset(email);
      res.json(PASSWORD_RESET_ACCEPTED);
    } catch (error) {
      req.log.error({ err: error }, "Hosted password reset request failed");
      res.status(503).json({
        error: "Violet could not contact the hosted account recovery service. Try again shortly.",
      });
    }
    return;
  }

  const [user] = await db.select().from(usersTable).where(and(
    eq(usersTable.email, email),
    eq(usersTable.isActive, "true"),
  )).limit(1);
  if (!user) {
    res.json(PASSWORD_RESET_ACCEPTED);
    return;
  }

  const token = generateToken();
  const tokenHash = hashPasswordResetToken(token);
  await db.update(usersTable).set({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  }).where(eq(usersTable.id, user.id));

  try {
    await sendPasswordResetEmail(email, token);
  } catch (error) {
    await db.update(usersTable).set({
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    }).where(and(
      eq(usersTable.id, user.id),
      eq(usersTable.passwordResetTokenHash, tokenHash),
    ));
    req.log.error({ err: error }, "Password reset email delivery failed");
  }

  res.json(PASSWORD_RESET_ACCEPTED);
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  if (isSelfHostedRuntime()) {
    res.status(400).json({
      error: "Open the reset link from your email to change your hosted Violet password.",
    });
    return;
  }

  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!/^[a-f0-9]{64}$/i.test(token) || newPassword.length < 10 || newPassword.length > 1024) {
    res.status(400).json({ error: "This password reset link is invalid or expired." });
    return;
  }

  const tokenHash = hashPasswordResetToken(token);
  const resetUser = await db.transaction(async (tx) => {
    const [updated] = await tx.update(usersTable).set({
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    }).where(and(
      eq(usersTable.passwordResetTokenHash, tokenHash),
      gt(usersTable.passwordResetExpiresAt, new Date()),
      eq(usersTable.isActive, "true"),
    )).returning({ id: usersTable.id });
    if (!updated) return null;
    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, updated.id));
    return updated;
  });
  if (!resetUser) {
    res.status(400).json({ error: "This password reset link is invalid or expired." });
    return;
  }

  res.json({ success: true });
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
  if (isSelfHostedRuntime()) {
    if (!req.licenseSessionToken) {
      res.status(401).json({
        error: "Changing the hosted password requires an internet connection. Your local POS session can continue offline.",
      });
      return;
    }
    try {
      await changeHostedPassword(req.licenseSessionToken, currentPassword, newPassword);
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
          : "Violet could not update the hosted account password.",
      });
      return;
    }
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
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
