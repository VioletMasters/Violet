import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  pool,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { requireSession } from "./auth";

const SUPER_ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const tenantId = randomUUID();
const userIds = new Map<string, string>();
const sessionTokens: string[] = [];

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (value: unknown) => MockResponse;
};

function response(): MockResponse {
  const result: MockResponse = {
    statusCode: 200,
    body: undefined,
    status(code) {
      result.statusCode = code;
      return result;
    },
    json(value) {
      result.body = value;
      return result;
    },
  };
  return result;
}

async function authenticate(token: string) {
  const req = {
    headers: { authorization: `Bearer ${token}` },
  } as never;
  const res = response();
  let continued = false;

  await requireSession(req, res as never, () => {
    continued = true;
  });

  return { req, res, continued };
}

async function createSession(label: string, lastActivityAt: Date, role = label) {
  const userId = randomUUID();
  const token = `session-timeout-${label}-${randomUUID()}`;
  userIds.set(label, userId);
  sessionTokens.push(token);

  await db.insert(usersTable).values({
    id: userId,
    tenantId,
    email: `${label}-${userId}@session-timeout.invalid`,
    passwordHash: "not-used-by-this-verification",
    firstName: "Session",
    lastName: label,
    role,
  });
  await db.insert(sessionsTable).values({
    userId,
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastActivityAt,
  });

  return token;
}

async function main() {
  const originalRuntimeMode = process.env.VIOLET_RUNTIME_MODE;
  delete process.env.VIOLET_RUNTIME_MODE;

  try {
    const now = Date.now();
    const idleToken = await createSession(
      "super_admin",
      new Date(now - SUPER_ADMIN_IDLE_TIMEOUT_MS),
    );
    const idleResult = await authenticate(idleToken);

    assert.equal(idleResult.continued, false, "An idle Super Admin must be rejected.");
    assert.equal(idleResult.res.statusCode, 401);
    assert.match(
      String((idleResult.res.body as { error: string }).error),
      /30 minutes of inactivity/,
    );
    const [deletedIdleSession] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, idleToken))
      .limit(1);
    assert.equal(deletedIdleSession, undefined, "An expired Super Admin session must be removed.");

    const activeLastActivityAt = new Date(now - SUPER_ADMIN_IDLE_TIMEOUT_MS + 1_000);
    const activeToken = await createSession("active_super_admin", activeLastActivityAt, "super_admin");
    const activeResult = await authenticate(activeToken);
    assert.equal(activeResult.continued, true, "An active Super Admin must remain usable.");
    assert.equal(activeResult.res.statusCode, 200);
    const [refreshedSession] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, activeToken))
      .limit(1);
    assert.ok(refreshedSession, "The active Super Admin session must still exist.");
    assert.ok(
      refreshedSession.lastActivityAt.getTime() > activeLastActivityAt.getTime(),
      "Successful Super Admin authentication must refresh activity.",
    );

    for (const role of ["owner", "administrator", "manager", "cashier"]) {
      const roleToken = await createSession(
        role,
        new Date(now - SUPER_ADMIN_IDLE_TIMEOUT_MS - 60_000),
      );
      const roleResult = await authenticate(roleToken);
      assert.equal(
        roleResult.continued,
        true,
        `${role} sessions must not use the Super Admin inactivity timeout.`,
      );
      assert.equal(roleResult.res.statusCode, 200);
    }

    console.log("Super Admin session timeout verification passed.");
  } finally {
    for (const token of sessionTokens) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    }
    for (const userId of userIds.values()) {
      await db.delete(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)));
    }
    if (originalRuntimeMode === undefined) {
      delete process.env.VIOLET_RUNTIME_MODE;
    } else {
      process.env.VIOLET_RUNTIME_MODE = originalRuntimeMode;
    }
    await pool.end();
  }
}

void main();