import { createHash, randomBytes } from "node:crypto";
import {
  db,
  customersTable,
  licensesTable,
  plansTable,
  productsTable,
  registersTable,
  storesTable,
  subscriptionsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export const FREE_PRODUCT_LIMIT = 250;
export const FREE_CUSTOMER_LIMIT = 500;
type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type EntitlementResource = "users" | "registers" | "branches" | "products" | "customers";

export interface EntitlementSnapshot extends Record<string, unknown> {
  tier: string;
  customerLabel: "Violet Free" | "Violet Plus";
  maxUsers: number;
  maxRegisters: number;
  maxBranches: number;
  maxProducts: number;
  maxCustomers: number;
  features: string[];
}

export class EntitlementLimitError extends Error {
  readonly resource: EntitlementResource;
  readonly limit: number;
  readonly current: number;

  constructor(resource: EntitlementResource, limit: number, current: number) {
    super(`Your ${resource} limit has been reached for the current Violet plan.`);
    this.name = "EntitlementLimitError";
    this.resource = resource;
    this.limit = limit;
    this.current = current;
  }
}

function hashLicenseKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createLicenseKey() {
  return `VL-${randomBytes(16).toString("hex").toUpperCase()}`;
}

function buildEntitlements(plan: typeof plansTable.$inferSelect): EntitlementSnapshot {
  const maxProducts = plan.tier === "free" ? Math.min(plan.maxProducts, FREE_PRODUCT_LIMIT) : plan.maxProducts;
  return {
    tier: plan.tier,
    customerLabel: plan.tier === "free" ? "Violet Free" : "Violet Plus",
    maxUsers: plan.maxUsers,
    maxRegisters: plan.maxRegisters,
    maxBranches: plan.maxBranches,
    maxProducts,
    maxCustomers: plan.tier === "free" ? Math.min(plan.maxCustomers, FREE_CUSTOMER_LIMIT) : plan.maxCustomers,
    features: plan.features ?? [],
  };
}

function licenseStatus(
  tenant: typeof tenantsTable.$inferSelect,
  subscription: typeof subscriptionsTable.$inferSelect | null,
) {
  if (tenant.status === "suspended") return "SUSPENDED";
  if (tenant.licenseStatus === "revoked") return "REVOKED";
  if (tenant.licenseStatus === "expired" || subscription?.status === "expired") return "EXPIRED";
  if (subscription?.status === "trial") return "TRIAL";
  if (subscription?.status === "cancelled" || subscription?.paymentStatus === "refunded") return "EXPIRED";
  return "ACTIVE";
}

export async function resolveTenantPlan(tenantId: string, executor: DbExecutor = db) {
  const [tenant] = await executor.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  if (!tenant) return null;
  const [subscription] = await executor
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);
  const planId = subscription?.planId ?? tenant.planId;
  const [plan] = planId
    ? await executor.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1)
    : [null];
  return { tenant, subscription: subscription ?? null, plan: plan ?? null };
}

export async function ensureTenantLicense(tenantId: string, executor: DbExecutor = db) {
  const resolved = await resolveTenantPlan(tenantId, executor);
  if (!resolved?.plan) return null;

  const snapshot = buildEntitlements(resolved.plan);
  const nextStatus = licenseStatus(resolved.tenant, resolved.subscription);
  const expiresAt = resolved.subscription?.currentPeriodEnd ?? resolved.tenant.licenseValidUntil ?? null;
  const [existing] = await executor
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await executor
      .update(licensesTable)
      .set({
        planId: resolved.plan.id,
        status: nextStatus,
        subscriptionStatus: resolved.subscription?.status ?? "active",
        entitlements: snapshot,
        expiresAt,
        lastValidatedAt: new Date(),
      })
      .where(eq(licensesTable.id, existing.id))
      .returning();
    return updated;
  }

  const licenseKey = createLicenseKey();
  await executor
    .insert(licensesTable)
    .values({
      tenantId,
      planId: resolved.plan.id,
      licenseKeyHash: hashLicenseKey(licenseKey),
      licenseKeyLast4: licenseKey.slice(-4),
      status: nextStatus,
      subscriptionStatus: resolved.subscription?.status ?? "active",
      entitlements: snapshot,
      activatedAt: new Date(),
      expiresAt,
      lastValidatedAt: new Date(),
    })
    .onConflictDoNothing({ target: licensesTable.tenantId });

  // The tenant-level unique constraint makes backfill and concurrent login
  // provisioning idempotent. Re-read after the insert so callers always
  // receive the canonical row, even when another request won the race.
  const [created] = await executor
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.tenantId, tenantId))
    .limit(1);
  return created ?? null;
}

export async function getTenantEntitlementState(tenantId: string) {
  const resolved = await resolveTenantPlan(tenantId);
  if (!resolved?.plan) return null;
  const license = await ensureTenantLicense(tenantId);
  const entitlements = buildEntitlements(resolved.plan);
  const [users, products, customers, stores, registers] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.tenantId, tenantId)),
    db.select({ count: sql<number>`count(*)` }).from(productsTable).where(eq(productsTable.tenantId, tenantId)),
    db.select({ count: sql<number>`count(*)` }).from(customersTable).where(eq(customersTable.tenantId, tenantId)),
    db.select({ count: sql<number>`count(*)` }).from(storesTable).where(eq(storesTable.tenantId, tenantId)),
    db.select({ count: sql<number>`count(*)` }).from(registersTable).where(eq(registersTable.tenantId, tenantId)),
  ]);

  return {
    ...resolved,
    license,
    entitlements,
    usage: {
      users: Number(users[0]?.count ?? 0),
      products: Number(products[0]?.count ?? 0),
      customers: Number(customers[0]?.count ?? 0),
      branches: Number(stores[0]?.count ?? 0),
      registers: Number(registers[0]?.count ?? 0),
    },
  };
}

export async function enforceTenantLimit(
  tenantId: string,
  resource: EntitlementResource,
  additional = 1,
) {
  const state = await getTenantEntitlementState(tenantId);
  if (!state) return;
  const limitKey = {
    users: "maxUsers",
    registers: "maxRegisters",
    branches: "maxBranches",
    products: "maxProducts",
    customers: "maxCustomers",
  }[resource] as keyof EntitlementSnapshot;
  const limit = state.entitlements[limitKey] as number;
  const current = state.usage[resource];
  if (limit >= 0 && current + additional > limit) {
    throw new EntitlementLimitError(resource, limit, current);
  }
}

export function entitlementErrorResponse(error: unknown) {
  if (!(error instanceof EntitlementLimitError)) return null;
  return {
    status: 409,
    body: {
      code: "PLAN_LIMIT_REACHED",
      resource: error.resource,
      current: error.current,
      limit: error.limit,
      error: error.message,
    },
  };
}