import { Router } from "express";
import {
  db,
  licenseSessionsTable,
  plansTable,
  subscriptionsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, gt, lte } from "drizzle-orm";
import { getLicenseFailure } from "../middlewares/auth";
import { hashPassword, verifyPassword } from "../lib/crypto";
import {
  generateLicenseSessionToken,
  hashLicenseToken,
  getInstallationId,
  isSelfHostedRuntime,
} from "../lib/remoteLicense";

const router = Router();
const LICENSE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function stringField(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    ? value.trim()
    : null;
}

async function licenseSnapshot(tenantId: string, message: string, valid: boolean) {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);
  const [plan] = subscription
    ? await db.select().from(plansTable).where(eq(plansTable.id, subscription.planId)).limit(1)
    : [null];

  return {
    valid,
    message,
    planTier: plan?.tier ?? null,
    subscriptionStatus: subscription?.status ?? null,
    paymentStatus: subscription?.paymentStatus ?? null,
    licenseStatus: tenant?.licenseStatus ?? null,
    licenseValidUntil: tenant?.licenseValidUntil?.toISOString() ?? null,
  };
}

router.post("/license/verify", async (req, res): Promise<void> => {
  if (isSelfHostedRuntime()) {
    res.status(404).json({ valid: false, message: "Not found" });
    return;
  }

  const email = stringField(req.body?.email, 320);
  const password = stringField(req.body?.password, 1024);
  const installationId = stringField(req.body?.installationId, 200);
  if (!email || !password || !installationId) {
    res.status(400).json({ valid: false, message: "Email, password, and installation identity are required." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || user.isActive !== "true" || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ valid: false, message: "The online Violet account could not be authenticated." });
    return;
  }
  if (user.role === "super_admin") {
    res.status(403).json({
      valid: false,
      message: "Use a licensed business account to activate a Store Host.",
    });
    return;
  }

  const failure = await getLicenseFailure(user.tenantId, { forceOnline: true });
  const snapshot = await licenseSnapshot(
    user.tenantId,
    failure ?? "Online license verified.",
    !failure,
  );
  if (failure) {
    res.status(402).json(snapshot);
    return;
  }

  const licenseToken = generateLicenseSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LICENSE_SESSION_TTL_MS);
  await db.delete(licenseSessionsTable).where(lte(licenseSessionsTable.expiresAt, now));
  await db.insert(licenseSessionsTable).values({
    tokenHash: hashLicenseToken(licenseToken),
    tenantId: user.tenantId,
    userId: user.id,
    installationId,
    lastVerifiedAt: now,
    expiresAt,
  });

  res.json({
    ...snapshot,
    licenseSessionToken: licenseToken,
    tokenExpiresAt: expiresAt.toISOString(),
  });
});

router.post("/license/revalidate", async (req, res): Promise<void> => {
  if (isSelfHostedRuntime()) {
    res.status(404).json({ valid: false, message: "Not found" });
    return;
  }

  const licenseToken = stringField(req.body?.licenseToken, 128);
  const installationId = stringField(req.body?.installationId, 200);
  if (!licenseToken || !installationId) {
    res.status(400).json({ valid: false, message: "License session and installation identity are required." });
    return;
  }

  const [licenseSession] = await db
    .select()
    .from(licenseSessionsTable)
    .where(and(
      eq(licenseSessionsTable.tokenHash, hashLicenseToken(licenseToken)),
      eq(licenseSessionsTable.installationId, installationId),
      gt(licenseSessionsTable.expiresAt, new Date()),
    ))
    .limit(1);
  if (!licenseSession) {
    res.status(401).json({ valid: false, message: "The online license session has expired. Sign in again." });
    return;
  }

  const failure = await getLicenseFailure(licenseSession.tenantId, { forceOnline: true });
  const snapshot = await licenseSnapshot(
    licenseSession.tenantId,
    failure ?? "Online license verified.",
    !failure,
  );
  if (failure) {
    res.status(402).json(snapshot);
    return;
  }

  await db
    .update(licenseSessionsTable)
    .set({ lastVerifiedAt: new Date() })
    .where(eq(licenseSessionsTable.id, licenseSession.id));

  res.json(snapshot);
});

router.post("/license/change-password", async (req, res): Promise<void> => {
  if (isSelfHostedRuntime()) {
    res.status(404).json({ valid: false, message: "Not found" });
    return;
  }

  const licenseToken = stringField(req.body?.licenseToken, 128);
  const installationId = stringField(req.body?.installationId, 200);
  const currentPassword = stringField(req.body?.currentPassword, 1024);
  const newPassword = stringField(req.body?.newPassword, 1024);
  if (!licenseToken || !installationId || !currentPassword || !newPassword || newPassword.length < 10) {
    res.status(400).json({
      valid: false,
      message: "A valid license session, current password, and new password are required.",
    });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ valid: false, message: "The new password must be different." });
    return;
  }

  const [licenseSession] = await db
    .select()
    .from(licenseSessionsTable)
    .where(and(
      eq(licenseSessionsTable.tokenHash, hashLicenseToken(licenseToken)),
      eq(licenseSessionsTable.installationId, installationId),
      gt(licenseSessionsTable.expiresAt, new Date()),
    ))
    .limit(1);
  if (!licenseSession) {
    res.status(401).json({
      valid: false,
      message: "The online license session has expired. Sign in again.",
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, licenseSession.userId))
    .limit(1);
  if (!user || user.isActive !== "true" || !verifyPassword(currentPassword, user.passwordHash)) {
    res.status(401).json({ valid: false, message: "Current password is incorrect." });
    return;
  }
  if (user.role === "super_admin") {
    res.status(403).json({
      valid: false,
      message: "Super administrator credentials cannot be used by Store Hosts.",
    });
    return;
  }

  await db
    .update(usersTable)
    .set({
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  res.json({ valid: true, message: "Password updated." });
});

export default router;