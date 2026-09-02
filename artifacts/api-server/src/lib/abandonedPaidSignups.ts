import { and, eq, lte } from "drizzle-orm";
import { db, subscriptionsTable, tenantsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { syncPendingCheckout } from "./subscriptionSync";

const ABANDONED_SIGNUP_GRACE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export async function deleteTenantAccount(tenantId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`);

    // These tables are intentionally deleted explicitly because the shared
    // schema does not use foreign-key cascades for tenant-owned records.
    await tx.execute(sql`DELETE FROM public.license_sessions WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.sessions WHERE user_id IN (
      SELECT id FROM public.users WHERE tenant_id = ${tenantId}
    )`);
    await tx.execute(sql`DELETE FROM public.subscription_events WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.subscriptions WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.settings WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.cash_events WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.register_shifts WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.registers WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.stores WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.sale_payments WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.sale_discounts WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.refund_items WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.refunds WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.sale_voids WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.sale_items WHERE sale_id IN (
      SELECT id FROM public.sales WHERE tenant_id = ${tenantId}
    )`);
    await tx.execute(sql`DELETE FROM public.inventory_movements WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.sales WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.receiving_discrepancies WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.purchase_receipt_items WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.purchase_receipts WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.purchase_order_items WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.purchase_orders WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.supplier_products WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.suppliers WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.products WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.categories WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.brands WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.customers WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.employees WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.audit_events WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.users WHERE tenant_id = ${tenantId}`);
    await tx.execute(sql`DELETE FROM public.tenants WHERE id = ${tenantId}`);
  });
}

export async function cleanupAbandonedPaidSignups() {
  const now = new Date();
  const candidates = await db
    .select({
      tenantId: tenantsTable.id,
      expiresAt: tenantsTable.pendingPaidSignupExpiresAt,
    })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.pendingPaidSignup, true),
        lte(tenantsTable.pendingPaidSignupExpiresAt, now),
      ),
    )
    .limit(100);

  let deleted = 0;
  for (const candidate of candidates) {
    try {
      const [subscription] = await db
        .select({
          pendingCheckoutId: subscriptionsTable.pendingWhopCheckoutConfigurationId,
        })
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.tenantId, candidate.tenantId))
        .limit(1);

      if (subscription?.pendingCheckoutId) {
        try {
          await syncPendingCheckout(candidate.tenantId);
        } catch (error) {
          // A Whop outage must never turn into destructive local cleanup.
          console.warn("Unable to verify an abandoned paid signup; retaining it", {
            tenantId: candidate.tenantId,
            error,
          });
          continue;
        }
      }

      const [current] = await db
        .select({
          pendingPaidSignup: tenantsTable.pendingPaidSignup,
          expiresAt: tenantsTable.pendingPaidSignupExpiresAt,
        })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, candidate.tenantId))
        .limit(1);

      if (
        !current?.pendingPaidSignup ||
        !current.expiresAt ||
        current.expiresAt > now
      ) {
        continue;
      }

      await deleteTenantAccount(candidate.tenantId);
      deleted += 1;
    } catch (error) {
      console.warn("Unable to clean up an abandoned paid signup", {
        tenantId: candidate.tenantId,
        error,
      });
    }
  }

  return { checked: candidates.length, deleted };
}

export function startAbandonedPaidSignupCleanup() {
  const timer = setInterval(() => {
    void cleanupAbandonedPaidSignups();
  }, CLEANUP_INTERVAL_MS);
  timer.unref();
  void cleanupAbandonedPaidSignups();
}

export const abandonedPaidSignupGracePeriodMs = ABANDONED_SIGNUP_GRACE_MS;