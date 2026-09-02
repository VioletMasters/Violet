import {
  db,
  plansTable,
  subscriptionsTable,
  subscriptionEventsTable,
  tenantsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getWhopClient } from "./whopClient";

type WhopClient = Awaited<ReturnType<typeof getWhopClient>>;
type Membership = Awaited<ReturnType<WhopClient["memberships"]["retrieve"]>>;
type PaymentPage = Awaited<ReturnType<WhopClient["payments"]["list"]>>;
type PaymentListItem = PaymentPage["data"][number];

const paidTiers = ["starter", "professional", "enterprise"] as const;
export type PaidTier = (typeof paidTiers)[number];

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === "string" && paidTiers.includes(value as PaidTier);
}

function configuredPlanId(tier: PaidTier) {
  const envName = {
    starter: "WHOP_PLAN_STARTER",
    professional: "WHOP_PLAN_PROFESSIONAL",
    enterprise: "WHOP_PLAN_ENTERPRISE",
  }[tier];
  return process.env[envName];
}

type SyncStatus = "active" | "pending" | "failed" | "past_due" | "cancelled" | "refunded";

export interface SubscriptionSyncResult {
  success: boolean;
  tier: PaidTier;
  status: SyncStatus;
  message: string;
}

export class WhopBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhopBindingError";
  }
}

function pendingCheckoutWhere(tenantId: string, checkoutId: string, claim: string) {
  return and(
    eq(subscriptionsTable.tenantId, tenantId),
    eq(subscriptionsTable.pendingWhopCheckoutConfigurationId, checkoutId),
    eq(subscriptionsTable.pendingWhopClaim, claim),
  );
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function metadataMatches(
  metadata: Record<string, unknown> | null | undefined,
  expected: { tenantId: string; userId: string; tier: PaidTier; claim: string },
) {
  return (
    metadataString(metadata, "violet_tenant_id") === expected.tenantId &&
    metadataString(metadata, "violet_user_id") === expected.userId &&
    metadataString(metadata, "violet_tier") === expected.tier &&
    metadataString(metadata, "violet_checkout_claim") === expected.claim
  );
}

function isFullyRefunded(payment: PaymentListItem) {
  if (!payment.refunded_at || !payment.refunded_amount) return false;
  const total = payment.total ?? payment.usd_total;
  return total != null && payment.refunded_amount >= total;
}

function isSuccessfulPayment(payment: PaymentListItem) {
  return payment.status === "paid" && Boolean(payment.paid_at) && !isFullyRefunded(payment);
}

function newestFirst<T extends { created_at: string }>(values: T[]) {
  return [...values].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

function membershipAccess(membership: Membership): {
  status: SyncStatus;
  subscriptionStatus: "active" | "trial" | "expired" | "cancelled";
  paymentStatus: "paid" | "past_due" | "pending" | "failed";
  licenseStatus: "valid" | "expired" | "revoked";
  message: string;
} {
  switch (membership.status) {
    case "active":
    case "completed":
    case "canceling":
      return {
        status: "active",
        subscriptionStatus: "active",
        paymentStatus: "paid",
        licenseStatus: "valid",
        message:
          membership.status === "canceling"
            ? "Your plan is active until the end of the current billing period."
            : "Your Violet plan is active.",
      };
    case "trialing":
      return {
        status: "active",
        subscriptionStatus: "trial",
        paymentStatus: "paid",
        licenseStatus: "valid",
        message: "Your Violet trial is active.",
      };
    case "past_due":
      return {
        status: "past_due",
        subscriptionStatus: "active",
        paymentStatus: "past_due",
        licenseStatus: "expired",
        message: "Whop could not renew this plan. Update payment in Whop to restore access.",
      };
    case "canceled":
      return {
        status: "cancelled",
        subscriptionStatus: "cancelled",
        paymentStatus: "failed",
        licenseStatus: "revoked",
        message: "This Whop membership has been cancelled.",
      };
    case "expired":
      return {
        status: "cancelled",
        subscriptionStatus: "expired",
        paymentStatus: "failed",
        licenseStatus: "expired",
        message: "This Whop membership has expired.",
      };
    case "drafted":
    case "unresolved":
    default:
      return {
        status: "pending",
        subscriptionStatus: "active",
        paymentStatus: "pending",
        licenseStatus: "expired",
        message: "Whop is still processing this membership.",
      };
  }
}

async function applyMembership(
  tenantId: string,
  planId: string,
  checkoutId: string,
  membership: Membership,
  payment: PaymentListItem | null,
  pendingClaim?: string,
) {
  const access = membershipAccess(membership);
  const now = new Date();
  const currentPeriodEnd = membership.current_period_end ? new Date(membership.current_period_end) : null;
  const currentPeriodStart = payment?.paid_at ? new Date(payment.paid_at) : new Date(membership.created_at);
  const cancelAtPeriodEnd = Boolean(
    (membership as unknown as { cancel_at_period_end?: boolean }).cancel_at_period_end,
  );

  await db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenantId))
      .limit(1);
    const updatedSubscriptions = await tx
      .update(subscriptionsTable)
      .set({
        planId,
        status: access.subscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
        whopCheckoutConfigurationId: checkoutId,
        pendingWhopCheckoutConfigurationId: null,
        pendingWhopTier: null,
        pendingWhopClaim: null,
        pendingWhopUserId: null,
        whopMembershipId: membership.id,
        whopPlanId: membership.plan_id,
        paymentStatus: access.paymentStatus,
        cancelAtPeriodEnd,
        cancelRequestedAt: cancelAtPeriodEnd ? previous?.cancelRequestedAt ?? now : null,
        cancelReason: cancelAtPeriodEnd ? previous?.cancelReason ?? null : null,
        lastWhopSyncAt: now,
        updatedAt: now,
      })
      .where(
        pendingClaim
          ? pendingCheckoutWhere(tenantId, checkoutId, pendingClaim)
          : eq(subscriptionsTable.tenantId, tenantId),
      )
      .returning({ id: subscriptionsTable.id });
    if (updatedSubscriptions.length === 0) {
      throw Object.assign(new Error("This checkout was cancelled or superseded."), {
        statusCode: 409,
      });
    }

    if (
      previous &&
      (previous.planId !== planId || !previous.whopMembershipId)
    ) {
      await tx.insert(subscriptionEventsTable).values({
        tenantId,
        subscriptionId: previous.id,
        eventType: previous.whopMembershipId ? "plan_changed" : "activated",
        fromPlanId: previous.planId,
        toPlanId: planId,
        source: "whop",
        whopMembershipId: membership.id,
        effectiveAt: currentPeriodStart,
      });
    }

    const [tenant] = await tx
      .select({ status: tenantsTable.status })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);

    await tx
      .update(tenantsTable)
      .set({
        planId,
        status: tenant?.status === "expired" && access.licenseStatus === "valid" ? "active" : tenant?.status,
        licenseStatus: access.licenseStatus,
        licenseValidatedAt: now,
        licenseValidUntil: currentPeriodEnd,
        pendingPaidSignup: false,
        pendingPaidSignupExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(tenantsTable.id, tenantId));
  });

  return access;
}

export async function syncPendingCheckout(
  tenantId: string,
  consistencyCheckoutId?: string,
): Promise<SubscriptionSyncResult> {
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);

  const checkoutId = subscription?.pendingWhopCheckoutConfigurationId;
  const tier = subscription?.pendingWhopTier;
  const claim = subscription?.pendingWhopClaim;
  const userId = subscription?.pendingWhopUserId;
  if (!subscription || !checkoutId || !isPaidTier(tier) || !claim || !userId) {
    throw Object.assign(new Error("No pending checkout exists for this account."), { statusCode: 409 });
  }
  if (consistencyCheckoutId && consistencyCheckoutId !== checkoutId) {
    throw Object.assign(new Error("That checkout does not belong to this account."), { statusCode: 403 });
  }

  const client = await getWhopClient();
  const checkout = await client.checkoutConfigurations.retrieve({ id: checkoutId });
  const expected = { tenantId, userId, tier, claim };
  const expectedPlanId = configuredPlanId(tier);

  if (
    checkout.id !== checkoutId ||
    checkout.account_id !== process.env.WHOP_COMPANY_ID ||
    !metadataMatches(checkout.metadata, expected) ||
    checkout.plan?.id !== expectedPlanId
  ) {
    throw Object.assign(new WhopBindingError("Whop returned an invalid checkout binding."), {
      statusCode: 403,
    });
  }

  const paymentPage = await client.payments.list({
    company_id: process.env.WHOP_COMPANY_ID!,
    checkout_configuration_ids: checkoutId,
    first: 50,
  });
  const payments = newestFirst(paymentPage.data).filter(
    (payment) =>
      payment.checkout_configuration_id === checkoutId &&
      payment.company?.id === process.env.WHOP_COMPANY_ID &&
      payment.plan?.id === expectedPlanId &&
      metadataMatches(payment.metadata, expected),
  );
  const refundedPayment = payments.find(isFullyRefunded);
  const paidPayment = payments.find(isSuccessfulPayment);

  let membership: Membership | null = null;
  if (paidPayment?.membership?.id) {
    membership = await client.memberships.retrieve({ id: paidPayment.membership.id });
  } else {
    const membershipPage = await client.memberships.list({
      account_id: process.env.WHOP_COMPANY_ID!,
      plan_id: expectedPlanId,
      first: 50,
    });
    membership =
      newestFirst(membershipPage.data).find((candidate) => metadataMatches(candidate.metadata, expected)) ?? null;
  }

  if (membership) {
    if (
      membership.account.id !== process.env.WHOP_COMPANY_ID ||
      membership.plan_id !== expectedPlanId ||
      !metadataMatches(membership.metadata, expected)
    ) {
      throw Object.assign(new WhopBindingError("Whop returned an invalid membership binding."), {
        statusCode: 403,
      });
    }

    if (refundedPayment) {
      const cleared = await db
        .update(subscriptionsTable)
        .set({
          pendingWhopCheckoutConfigurationId: null,
          pendingWhopTier: null,
          pendingWhopClaim: null,
          pendingWhopUserId: null,
          lastWhopSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(pendingCheckoutWhere(tenantId, checkoutId, claim))
        .returning({ id: subscriptionsTable.id });
      if (cleared.length === 0) {
        throw Object.assign(new Error("This checkout was cancelled or superseded."), {
          statusCode: 409,
        });
      }
      return {
        success: false,
        tier,
        status: "refunded",
        message: "This payment was refunded, so the requested plan was not activated.",
      };
    }

    const access = membershipAccess(membership);
    if (access.status === "active") {
      const [paidPlan] = await db.select().from(plansTable).where(eq(plansTable.tier, tier)).limit(1);
      if (!paidPlan) throw new Error(`The ${tier} plan is not configured in Violet.`);
      await applyMembership(tenantId, paidPlan.id, checkoutId, membership, paidPayment ?? null, claim);
      return { success: true, tier, status: "active", message: access.message };
    }
    if (access.status === "cancelled") {
      const cleared = await db
        .update(subscriptionsTable)
        .set({
          pendingWhopCheckoutConfigurationId: null,
          pendingWhopTier: null,
          pendingWhopClaim: null,
          pendingWhopUserId: null,
          lastWhopSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(pendingCheckoutWhere(tenantId, checkoutId, claim))
        .returning({ id: subscriptionsTable.id });
      if (cleared.length === 0) {
        throw Object.assign(new Error("This checkout was cancelled or superseded."), {
          statusCode: 409,
        });
      }
    }
    return { success: false, tier, status: access.status, message: access.message };
  }

  const failedPayment = payments.find(
    (payment) => payment.status === "void" || Boolean(payment.failure_message) || (payment.payments_failed ?? 0) > 0,
  );
  if (failedPayment) {
    const cleared = await db
      .update(subscriptionsTable)
      .set({
        pendingWhopCheckoutConfigurationId: null,
        pendingWhopTier: null,
        pendingWhopClaim: null,
        pendingWhopUserId: null,
        lastWhopSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(pendingCheckoutWhere(tenantId, checkoutId, claim))
      .returning({ id: subscriptionsTable.id });
    if (cleared.length === 0) {
      throw Object.assign(new Error("This checkout was cancelled or superseded."), {
        statusCode: 409,
      });
    }
    return {
      success: false,
      tier,
      status: "failed",
      message: failedPayment.failure_message || "Whop could not complete the payment.",
    };
  }

  const refreshed = await db
    .update(subscriptionsTable)
    .set({ lastWhopSyncAt: new Date(), updatedAt: new Date() })
    .where(pendingCheckoutWhere(tenantId, checkoutId, claim))
    .returning({ id: subscriptionsTable.id });
  if (refreshed.length === 0) {
    throw Object.assign(new Error("This checkout was cancelled or superseded."), {
      statusCode: 409,
    });
  }
  return {
    success: false,
    tier,
    status: "pending",
    message: "Whop is still processing the checkout. This page will check again shortly.",
  };
}

export async function syncExistingMembership(tenantId: string): Promise<void> {
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);
  if (!subscription?.whopMembershipId || !subscription.whopCheckoutConfigurationId) return;

  const client = await getWhopClient();
  const checkout = await client.checkoutConfigurations.retrieve({
    id: subscription.whopCheckoutConfigurationId,
  });
  const membership = await client.memberships.retrieve({ id: subscription.whopMembershipId });
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, subscription.planId)).limit(1);
  const expectedPlanId = plan && isPaidTier(plan.tier) ? plan.whopPlanId ?? configuredPlanId(plan.tier) : null;
  const tier = plan && isPaidTier(plan.tier) ? plan.tier : null;
  const claim = metadataString(checkout.metadata, "violet_checkout_claim");
  const userId = metadataString(checkout.metadata, "violet_user_id");
  const expected = tier && claim && userId ? { tenantId, userId, tier, claim } : null;
  if (
    !plan ||
    !expectedPlanId ||
    !expected ||
    checkout.id !== subscription.whopCheckoutConfigurationId ||
    checkout.account_id !== process.env.WHOP_COMPANY_ID ||
    checkout.plan?.id !== expectedPlanId ||
    !metadataMatches(checkout.metadata, expected) ||
    membership.account.id !== process.env.WHOP_COMPANY_ID ||
    membership.plan_id !== expectedPlanId ||
    membership.id !== subscription.whopMembershipId ||
    !metadataMatches(membership.metadata, expected)
  ) {
    throw new WhopBindingError("Whop returned an invalid membership binding.");
  }

  const paymentPage = await client.payments.list({
    company_id: process.env.WHOP_COMPANY_ID!,
    query: membership.id,
    first: 50,
  });
  const payments = newestFirst(paymentPage.data).filter(
    (payment) =>
      payment.company?.id === process.env.WHOP_COMPANY_ID &&
      payment.plan?.id === expectedPlanId &&
      payment.membership?.id === membership.id &&
      metadataMatches(payment.metadata, expected),
  );
  const latestPayment = payments[0] ?? null;
  if (latestPayment && isFullyRefunded(latestPayment)) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(subscriptionsTable)
        .set({
          status: "cancelled",
          paymentStatus: "refunded",
          lastWhopSyncAt: now,
          updatedAt: now,
        })
        .where(eq(subscriptionsTable.tenantId, tenantId));
      await tx
        .update(tenantsTable)
        .set({
          licenseStatus: "revoked",
          licenseValidatedAt: now,
          updatedAt: now,
        })
        .where(eq(tenantsTable.id, tenantId));
    });
    return;
  }

  await applyMembership(
    tenantId,
    subscription.planId,
    subscription.whopCheckoutConfigurationId,
    membership,
    payments.find(isSuccessfulPayment) ?? null,
  );
}

const membershipSyncs = new Map<string, Promise<void>>();

export async function refreshWhopMembershipIfStale(
  tenantId: string,
  lastWhopSyncAt: Date | null,
  maxAgeMs = 5 * 60 * 1000,
): Promise<void> {
  if (lastWhopSyncAt && Date.now() - lastWhopSyncAt.getTime() < maxAgeMs) return;

  const current = membershipSyncs.get(tenantId);
  if (current) return current;

  const sync = syncExistingMembership(tenantId).finally(() => {
    membershipSyncs.delete(tenantId);
  });
  membershipSyncs.set(tenantId, sync);
  return sync;
}