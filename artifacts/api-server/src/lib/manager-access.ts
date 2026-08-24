import { createHash, createHmac, timingSafeEqual } from "crypto";

const MANAGER_ACCESS_TTL_MS = 15 * 60 * 1000;

interface ManagerAccessPayload {
  version: 1;
  sessionTokenHash: string;
  tenantId: string;
  expiresAt: number;
}

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured for manager access");
  }
  return secret;
}

function encode(payload: ManagerAccessPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signature(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function hasMatchingSignature(payload: string, receivedSignature: string): boolean {
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(receivedSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function issueManagerAccess(sessionToken: string, tenantId: string): { accessToken: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + MANAGER_ACCESS_TTL_MS);
  const payload = encode({
    version: 1,
    sessionTokenHash: hashSessionToken(sessionToken),
    tenantId,
    expiresAt: expiresAt.getTime(),
  });

  return {
    accessToken: `${payload}.${signature(payload)}`,
    expiresAt,
  };
}

export function hasValidManagerAccess(accessToken: string, sessionToken: string, tenantId: string): boolean {
  const [encodedPayload, receivedSignature, ...extraParts] = accessToken.split(".");
  if (!encodedPayload || !receivedSignature || extraParts.length > 0 || !hasMatchingSignature(encodedPayload, receivedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as ManagerAccessPayload;
    return payload.version === 1
      && payload.sessionTokenHash === hashSessionToken(sessionToken)
      && payload.tenantId === tenantId
      && Number.isFinite(payload.expiresAt)
      && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}