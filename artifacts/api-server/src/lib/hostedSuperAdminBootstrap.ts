import { auditEventsTable, db, tenantsTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "./crypto";
import { logger } from "./logger";
import { isSelfHostedRuntime } from "./remoteLicense";

const BOOTSTRAP_EMAIL_KEY = "VIOLET_BOOTSTRAP_ADMIN_EMAIL";
const BOOTSTRAP_PASSWORD_KEY = "VIOLET_BOOTSTRAP_ADMIN_PASSWORD";
const ONE_TIME_RESET_EMAIL_KEY = "VIOLET_ONE_TIME_ADMIN_RESET_EMAIL";
const ONE_TIME_RESET_ACTION = "one_time_hosted_admin_reset";
const MIN_PASSWORD_LENGTH = 12;

interface BootstrapCredentials {
  email: string;
  password: string;
}

function readBootstrapCredentials(): BootstrapCredentials | null {
  if (process.env.NODE_ENV !== "production" || isSelfHostedRuntime()) {
    return null;
  }

  const email = process.env[BOOTSTRAP_EMAIL_KEY]?.trim().toLowerCase();
  const password = process.env[BOOTSTRAP_PASSWORD_KEY];

  if (!email && !password) {
    return null;
  }

  if (!email || !password) {
    throw new Error(
      `${BOOTSTRAP_EMAIL_KEY} and ${BOOTSTRAP_PASSWORD_KEY} must both be configured.`,
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${BOOTSTRAP_EMAIL_KEY} must be a valid email address.`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `${BOOTSTRAP_PASSWORD_KEY} must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  return { email, password };
}

export async function bootstrapHostedSuperAdmin(): Promise<boolean> {
  const credentials = readBootstrapCredentials();
  if (!credentials) {
    return false;
  }

  const passwordHash = hashPassword(credentials.password);
  const created = await db.transaction(async (tx) => {
    // Publishing can start multiple autoscale instances concurrently. Hold a
    // transaction-scoped lock so only one instance evaluates and creates the
    // first hosted super-admin.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('violet:hosted-super-admin-bootstrap'))`,
    );

    const [existingSuperAdmin] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "super_admin"))
      .limit(1);

    if (existingSuperAdmin) {
      return false;
    }

    const [existingUser] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, credentials.email))
      .limit(1);

    if (existingUser) {
      await tx
        .update(usersTable)
        .set({
          passwordHash,
          role: "super_admin",
          isActive: "true",
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existingUser.id));
      return true;
    }

    let [tenant] = await tx
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.email, credentials.email))
      .limit(1);

    if (!tenant) {
      [tenant] = await tx
        .insert(tenantsTable)
        .values({
          name: "Violet Platform",
          email: credentials.email,
          status: "active",
          licenseStatus: "valid",
          licenseValidatedAt: new Date(),
        })
        .returning({ id: tenantsTable.id });
    }

    await tx.insert(usersTable).values({
      tenantId: tenant.id,
      email: credentials.email,
      passwordHash,
      firstName: "Violet",
      lastName: "Administrator",
      role: "super_admin",
      isActive: "true",
      mustChangePassword: false,
    });

    return true;
  });

  if (created) {
    logger.info(
      "Hosted super-admin bootstrap completed. Remove the bootstrap secrets after confirming access.",
    );
  } else {
    logger.info("Hosted super-admin bootstrap skipped because a super-admin already exists.");
  }

  return created;
}

function readOneTimeAdminResetEmail(): string | null {
  if (process.env.NODE_ENV !== "production" || isSelfHostedRuntime()) {
    return null;
  }

  const email = process.env[ONE_TIME_RESET_EMAIL_KEY]?.trim().toLowerCase();
  if (!email) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${ONE_TIME_RESET_EMAIL_KEY} must be a valid email address.`);
  }

  return email;
}

export async function applyOneTimeHostedAdminReset(): Promise<boolean> {
  const email = readOneTimeAdminResetEmail();
  if (!email) {
    return false;
  }

  const applied = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('violet:one-time-hosted-admin-reset'))`,
    );

    const [user] = await tx
      .select({
        id: usersTable.id,
        tenantId: usersTable.tenantId,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      logger.warn({ email }, "One-time hosted admin reset target was not found.");
      return false;
    }

    const [consumed] = await tx
      .select({ id: auditEventsTable.id })
      .from(auditEventsTable)
      .where(and(
        eq(auditEventsTable.action, ONE_TIME_RESET_ACTION),
        eq(auditEventsTable.entityType, "user"),
        eq(auditEventsTable.entityId, user.id),
      ))
      .limit(1);

    if (consumed) {
      return false;
    }

    await tx
      .update(usersTable)
      .set({
        role: "super_admin",
        isActive: "true",
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    await tx.insert(auditEventsTable).values({
      tenantId: user.tenantId,
      actorId: null,
      storeId: null,
      action: ONE_TIME_RESET_ACTION,
      entityType: "user",
      entityId: user.id,
      reason: "One-time hosted admin reset",
    });

    return true;
  });

  if (applied) {
    logger.info(
      "One-time hosted admin reset completed. Remove VIOLET_ONE_TIME_ADMIN_RESET_EMAIL after confirming access.",
    );
  } else {
    logger.info("One-time hosted admin reset skipped because it was already consumed.");
  }

  return applied;
}