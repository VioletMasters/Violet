import { createHash, randomBytes } from "node:crypto";
import {
  db,
  plansTable,
  subscriptionsTable,
  tenantsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export interface RemoteLicenseSnapshot {
  valid: boolean;
  message: string;
  planTier: string | null;
  subscriptionStatus: string | null;
  paymentStatus: string | null;
  licenseStatus: string | null;
  licenseValidUntil: string | null;
  licenseSessionToken?: string;
  tokenExpiresAt?: string;
}

export class RemoteLicenseError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "RemoteLicenseError";
    this.statusCode = statusCode;
  }
}

const REMOTE_REVALIDATION_INTERVAL_MS = 15 * 60 * 1000;

export function isSelfHostedRuntime() {
  return process.env.VIOLET_RUNTIME_MODE === "self_hosted";
}

export function shouldRevalidateRemoteLicense(lastValidatedAt: Date | null) {
  return !lastValidatedAt || Date.now() - lastValidatedAt.getTime() >= REMOTE_REVALIDATION_INTERVAL_MS;
}

export function getInstallationId() {
  const configured = process.env.VIOLET_INSTALLATION_ID?.trim();
  if (configured) return configured;

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new RemoteLicenseError("Self-hosted installation identity is not configured.");
  return createHash("sha256").update(`violet-installation:${sessionSecret}`).digest("hex");
}

export function hashLicenseToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function licenseServerUrl() {
  const configured = process.env.VIOLET_LICENSE_SERVER_URL?.trim();
  if (!configured) {
    throw new RemoteLicenseError(
      "Online license validation is not configured. Set VIOLET_LICENSE_SERVER_URL before signing in.",
      500,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new RemoteLicenseError("VIOLET_LICENSE_SERVER_URL is not a valid URL.", 500);
  }

  const isLocalHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw new RemoteLicenseError("VIOLET_LICENSE_SERVER_URL must use HTTPS.", 500);
  }

  return parsed.toString().replace(/\/$/, "");
}

async function postLicenseRequest(path: string, body: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`${licenseServerUrl()}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new RemoteLicenseError(
      "Violet could not reach the online license service. An internet connection is required to sign in.",
    );
  }

  const payload = (await response.json().catch(() => null)) as Partial<RemoteLicenseSnapshot> | null;
  if (!response.ok || payload?.valid !== true) {
    throw new RemoteLicenseError(
      payload?.message || "This Violet account could not be verified online.",
      response.status >= 400 && response.status < 500 ? response.status : 503,
    );
  }

  return payload as RemoteLicenseSnapshot;
}

export async function verifyHostedLicenseCredentials(email: string, password: string) {
  const snapshot = await postLicenseRequest("/api/license/verify", {
    email,
    password,
    installationId: getInstallationId(),
  });
  if (!snapshot.licenseSessionToken || !snapshot.tokenExpiresAt) {
    throw new RemoteLicenseError("The online license service returned an incomplete session.", 502);
  }
  return snapshot;
}

export async function revalidateHostedLicense(licenseToken: string) {
  return postLicenseRequest("/api/license/revalidate", {
    licenseToken,
    installationId: getInstallationId(),
  });
}

export async function syncLocalLicenseSnapshot(tenantId: string, snapshot: RemoteLicenseSnapshot) {
  if (!snapshot.valid || !snapshot.planTier) {
    throw new RemoteLicenseError("The online license service returned an incomplete license.", 502);
  }

  const [plan] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.tier, snapshot.planTier))
    .limit(1);
  if (!plan) {
    throw new RemoteLicenseError(`The ${snapshot.planTier} plan is not installed on this Violet server.`, 500);
  }

  const now = new Date();
  const licenseValidUntil = snapshot.licenseValidUntil ? new Date(snapshot.licenseValidUntil) : null;
  if (licenseValidUntil && Number.isNaN(licenseValidUntil.getTime())) {
    throw new RemoteLicenseError("The online license service returned an invalid expiry date.", 502);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tenantsTable)
      .set({
        planId: plan.id,
        licenseStatus: "valid",
        licenseValidatedAt: now,
        licenseValidUntil,
        updatedAt: now,
      })
      .where(eq(tenantsTable.id, tenantId));

    const [subscription] = await tx
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenantId))
      .limit(1);

    const values = {
      planId: plan.id,
      status: snapshot.subscriptionStatus || "active",
      paymentStatus: snapshot.paymentStatus || (snapshot.planTier === "free" ? "not_required" : "paid"),
      whopPlanId: null,
      whopMembershipId: null,
      currentPeriodEnd: licenseValidUntil,
      lastWhopSyncAt: null,
      updatedAt: now,
    };

    if (subscription) {
      await tx
        .update(subscriptionsTable)
        .set(values)
        .where(eq(subscriptionsTable.id, subscription.id));
    } else {
      await tx.insert(subscriptionsTable).values({
        tenantId,
        ...values,
      });
    }
  });
}

export function generateLicenseSessionToken() {
  return randomBytes(32).toString("hex");
}