import { createHash, createHmac, scryptSync, randomBytes, timingSafeEqual } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const hashBuf = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(hashBuf, derived);
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const EMAIL_VERIFICATION_MONITOR_PURPOSE = "email-verification-monitor";

function getSessionSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET is required to sign verification monitor tokens.");
  }
  return secret;
}

export function createEmailVerificationMonitorToken(userId: string, expiresAt: Date): string {
  const payload = Buffer.from(JSON.stringify({
    purpose: EMAIL_VERIFICATION_MONITOR_PURPOSE,
    sub: userId,
    exp: expiresAt.getTime(),
  })).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyEmailVerificationMonitorToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || token.length > 1024) return null;

  const expectedSignature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const providedSignature = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (
    providedSignature.length !== expectedSignatureBuffer.length
    || !timingSafeEqual(providedSignature, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      purpose?: unknown;
      sub?: unknown;
      exp?: unknown;
    };
    if (
      claims.purpose !== EMAIL_VERIFICATION_MONITOR_PURPOSE
      || typeof claims.sub !== "string"
      || !claims.sub
      || typeof claims.exp !== "number"
      || !Number.isFinite(claims.exp)
      || claims.exp <= Date.now()
    ) {
      return null;
    }
    return claims.sub;
  } catch {
    return null;
  }
}

export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
