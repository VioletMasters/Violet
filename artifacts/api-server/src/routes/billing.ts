import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  CreateBillingCheckoutBody,
  ReconcileBillingCheckoutBody,
} from "@workspace/api-zod";
import { db, plansTable, subscriptionsTable } from "@workspace/db";
import { isManagerRole, requireSession } from "../middlewares/auth";
import { getWhopClient } from "../lib/whopClient";
import {
  isPaidTier,
  syncExistingMembership,
  syncPendingCheckout,
  type PaidTier,
} from "../lib/subscriptionSync";

const router = Router();

const planEnvByTier: Record<PaidTier, string> = {
  starter: "WHOP_PLAN_STARTER",
  professional: "WHOP_PLAN_PROFESSIONAL",
  enterprise: "WHOP_PLAN_ENTERPRISE",
};

function planIdFor(tier: PaidTier) {
  return process.env[planEnvByTier[tier]];
}

function appRedirect(req: Request, tier: PaidTier) {
  const query = `checkout=complete&tier=${encodeURIComponent(tier)}`;
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/subscription?${query}`;

  const publicHost = process.env.REPLIT_DEV_DOMAIN;
  if (publicHost) return `https://${publicHost}/subscription?${query}`;
  return `https://${req.get("host")}/subscription?${query}`;
}

router.post("/billing/checkout", requireSession, async (req, res): Promise<void> => {
  const parsed = CreateBillingCheckoutBody.safeParse(req.body);
  if (!parsed.success || !isPaidTier(parsed.data.tier)) {
    res.status(400).json({ error: "Choose a valid paid Violet plan." });
    return;
  }
  if (!req.user || !isManagerRole(req.user.role)) {
    res.status(403).json({ error: "Only an account owner or manager can change billing." });
    return;
  }

  const tier = parsed.data.tier;
  const planId = planIdFor(tier);
  const companyId = process.env.WHOP_COMPANY_ID;
  if (!planId || !companyId) {
    res.status(503).json({ error: "Checkout is not configured yet." });
    return;
  }

  let createdCheckoutId: string | null = null;
  try {
    const client = await getWhopClient();
    const [existingSubscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, req.tenantId!))
      .limit(1);
    if (existingSubscription?.whopMembershipId) {
      await syncExistingMembership(req.tenantId!);
    }

    const [violetPlan] = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.tier, tier))
      .limit(1);
    if (!violetPlan) {
      throw Object.assign(new Error("This Violet plan is not configured."), { statusCode: 503 });
    }
    const whopPlan = await client.plans.retrieve({ id: planId });
    const expectedCheckoutPrice = Number(violetPlan.checkoutPrice);
    if (
      whopPlan.id !== planId ||
      whopPlan.account?.id !== companyId ||
      whopPlan.currency.toUpperCase() !== violetPlan.checkoutCurrency.toUpperCase() ||
      whopPlan.plan_type !== "renewal" ||
      whopPlan.billing_period !== 30 ||
      whopPlan.initial_price !== expectedCheckoutPrice ||
      whopPlan.renewal_price !== expectedCheckoutPrice
    ) {
      throw Object.assign(
        new Error("The Whop plan price does not match Violet's published checkout price."),
        { statusCode: 503 },
      );
    }

    const checkout = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${req.tenantId!}, 0))`,
      );
      const [subscription] = await tx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.tenantId, req.tenantId!))
        .limit(1);
      if (!subscription) {
        throw Object.assign(new Error("This account does not have a subscription record."), {
          statusCode: 409,
        });
      }
      if (
        subscription.whopMembershipId &&
        !["expired", "cancelled"].includes(subscription.status)
      ) {
        throw Object.assign(
          new Error(
            "This account already has a chargeable Whop membership. Cancel it and wait for it to end before starting another paid plan.",
          ),
          { statusCode: 409 },
        );
      }

      if (subscription.pendingWhopCheckoutConfigurationId) {
        if (subscription.pendingWhopTier !== tier) {
          throw Object.assign(
            new Error("Cancel the current pending checkout before choosing a different plan."),
            { statusCode: 409 },
          );
        }
        const existing = await client.checkoutConfigurations.retrieve({
          id: subscription.pendingWhopCheckoutConfigurationId,
        });
        if (existing.purchase_url) {
          if (!subscription.pendingWhopClaim || !subscription.pendingWhopUserId) {
            const existingClaim = existing.metadata?.violet_checkout_claim;
            const existingUserId = existing.metadata?.violet_user_id;
            if (
              existing.account_id !== companyId ||
              existing.plan?.id !== planId ||
              existing.metadata?.violet_tenant_id !== req.tenantId ||
              existing.metadata?.violet_tier !== tier ||
              typeof existingClaim !== "string" ||
              typeof existingUserId !== "string"
            ) {
              throw Object.assign(new Error("The pending checkout has an invalid account binding."), {
                statusCode: 403,
              });
            }
            await tx
              .update(subscriptionsTable)
              .set({
                pendingWhopClaim: existingClaim,
                pendingWhopUserId: existingUserId,
                updatedAt: new Date(),
              })
              .where(eq(subscriptionsTable.tenantId, req.tenantId!));
          }
          return existing;
        }
      }

      const claim = randomUUID();
      const created = await client.checkoutConfigurations.create({
        account_id: companyId,
        plan_id: planId,
        redirect_url: appRedirect(req, tier),
        metadata: {
          violet_tenant_id: req.tenantId!,
          violet_user_id: req.user!.id,
          violet_tier: tier,
          violet_checkout_claim: claim,
          source: "violet-app",
        },
      });
      createdCheckoutId = created.id;

      await tx
        .update(subscriptionsTable)
        .set({
          pendingWhopCheckoutConfigurationId: created.id,
          pendingWhopTier: tier,
          pendingWhopClaim: claim,
          pendingWhopUserId: req.user!.id,
          lastWhopSyncAt: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionsTable.tenantId, req.tenantId!));
      return created;
    });

    if (!checkout.purchase_url) {
      res.status(502).json({ error: "Whop did not return a checkout URL." });
      return;
    }

    res.json({
      checkoutUrl: checkout.purchase_url,
      checkoutConfigurationId: checkout.id,
    });
  } catch (error) {
    req.log.error({ err: error, tier, tenantId: req.tenantId }, "Whop checkout creation failed");
    if (createdCheckoutId) {
      try {
        const client = await getWhopClient();
        await client.checkoutConfigurations.delete({ id: createdCheckoutId });
      } catch (cleanupError) {
        req.log.warn({ err: cleanupError, createdCheckoutId }, "Unable to clean up orphaned Whop checkout");
      }
    }
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 502;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : "Unable to start checkout right now.",
    });
  }
});

router.delete("/billing/checkout", requireSession, async (req, res): Promise<void> => {
  if (!req.user || !isManagerRole(req.user.role)) {
    res.status(403).json({ error: "Only an account owner or manager can change billing." });
    return;
  }

  try {
    const currentStatus = await syncPendingCheckout(req.tenantId!);
    if (currentStatus.success) {
      throw Object.assign(new Error("This checkout has already activated a paid plan."), {
        statusCode: 409,
      });
    }

    const client = await getWhopClient();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${req.tenantId!}, 0))`,
      );
      const [subscription] = await tx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.tenantId, req.tenantId!))
        .limit(1);
      if (
        !subscription?.pendingWhopCheckoutConfigurationId ||
        !subscription.pendingWhopClaim
      ) {
        throw Object.assign(new Error("No checkout is currently pending."), { statusCode: 409 });
      }

      await client.checkoutConfigurations.delete({
        id: subscription.pendingWhopCheckoutConfigurationId,
      });
      const cleared = await tx
        .update(subscriptionsTable)
        .set({
          pendingWhopCheckoutConfigurationId: null,
          pendingWhopTier: null,
          pendingWhopClaim: null,
          pendingWhopUserId: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptionsTable.tenantId, req.tenantId!),
            eq(
              subscriptionsTable.pendingWhopCheckoutConfigurationId,
              subscription.pendingWhopCheckoutConfigurationId,
            ),
            eq(subscriptionsTable.pendingWhopClaim, subscription.pendingWhopClaim),
          ),
        )
        .returning({ id: subscriptionsTable.id });
      if (cleared.length === 0) {
        throw Object.assign(
          new Error("This checkout completed while cancellation was in progress."),
          { statusCode: 409 },
        );
      }
    });
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error, tenantId: req.tenantId }, "Whop checkout cancellation failed");
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 502;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : "Unable to cancel checkout right now.",
    });
  }
});

router.post("/billing/reconcile", requireSession, async (req, res): Promise<void> => {
  const parsed = ReconcileBillingCheckoutBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reconciliation request." });
    return;
  }
  if (!req.user || !isManagerRole(req.user.role)) {
    res.status(403).json({ error: "Only an account owner or manager can change billing." });
    return;
  }

  try {
    const result = await syncPendingCheckout(
      req.tenantId!,
      parsed.data.checkoutConfigurationId,
    );
    res.json(result);
  } catch (error) {
    req.log.error({ err: error, tenantId: req.tenantId }, "Whop payment reconciliation failed");
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 502;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : "Unable to verify the payment right now.",
    });
  }
});

export default router;