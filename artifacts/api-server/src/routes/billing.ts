import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, plansTable, subscriptionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getWhopClient } from "../lib/whopClient";

const router = Router();
const companyId = () => process.env.WHOP_COMPANY_ID;

const planEnvByTier = {
  starter: "WHOP_PLAN_STARTER",
  professional: "WHOP_PLAN_PROFESSIONAL",
  enterprise: "WHOP_PLAN_ENTERPRISE",
} as const;

type PaidTier = keyof typeof planEnvByTier;

function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === "string" && value in planEnvByTier;
}

function websiteRedirect(req: Request) {
  const configured = process.env.PUBLIC_WEBSITE_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/pricing?checkout=complete`;
  // Whop requires an HTTPS redirect URL even during local development. Prefer
  // Replit's public development hostname over localhost; deployments should
  // set PUBLIC_WEBSITE_URL to the published website URL.
  const publicHost = process.env.REPLIT_DEV_DOMAIN;
  if (publicHost) return `https://${publicHost}/violet-website/pricing?checkout=complete`;
  return `https://${req.get("host")}/violet-website/pricing?checkout=complete`;
}

router.post("/billing/checkout", async (req, res): Promise<void> => {
  const { tier } = req.body as { tier?: unknown };
  if (!isPaidTier(tier)) {
    res.status(400).json({ error: "Choose a valid paid Violet plan." });
    return;
  }

  const planId = process.env[planEnvByTier[tier]];
  const whopCompanyId = companyId();
  if (!planId || !whopCompanyId) {
    res.status(503).json({ error: "Checkout is not configured yet." });
    return;
  }

  try {
    const client = await getWhopClient();
    const checkout = await client.checkoutConfigurations.create({
      account_id: whopCompanyId,
      plan_id: planId,
      redirect_url: websiteRedirect(req),
      metadata: { violet_tier: tier, source: "violet-website" },
    });

    if (!checkout.purchase_url) {
      res.status(502).json({ error: "Whop did not return a checkout URL." });
      return;
    }

    res.json({ checkoutUrl: checkout.purchase_url, checkoutConfigurationId: checkout.id });
  } catch (error) {
    req.log.error({ err: error, tier }, "Whop checkout creation failed");
    res.status(502).json({ error: "Unable to start checkout right now." });
  }
});

router.post("/billing/reconcile", requireAuth, async (req, res): Promise<void> => {
  const checkoutConfigurationId = req.body?.checkoutConfigurationId;
  if (typeof checkoutConfigurationId !== "string" || !/^ch_[A-Za-z0-9]+$/.test(checkoutConfigurationId)) {
    res.status(400).json({ error: "A valid checkout configuration is required." });
    return;
  }

  const whopCompanyId = companyId();
  if (!whopCompanyId) {
    res.status(503).json({ error: "Checkout is not configured yet." });
    return;
  }

  try {
    const client = await getWhopClient();
    const checkout = await client.checkoutConfigurations.retrieve({ id: checkoutConfigurationId });
    const tier = checkout.metadata?.violet_tier;
    if (!isPaidTier(tier) || checkout.plan?.id !== process.env[planEnvByTier[tier]]) {
      res.status(400).json({ error: "This checkout does not belong to Violet." });
      return;
    }

    const payments = await client.payments.list({
      company_id: whopCompanyId,
      checkout_configuration_ids: [checkoutConfigurationId],
      first: 20,
    });
    const paidPayment = payments.data?.find((payment) =>
      ["paid", "succeeded", "successful", "completed"].includes(String(payment.status).toLowerCase()),
    );
    if (!paidPayment) {
      res.status(409).json({ error: "Payment has not been confirmed by Whop yet." });
      return;
    }

    const [plan] = await db.select().from(plansTable).where(eq(plansTable.tier, tier)).limit(1);
    if (!plan) {
      res.status(404).json({ error: "Matching Violet plan was not found." });
      return;
    }

    await db
      .update(subscriptionsTable)
      .set({
        planId: plan.id,
        status: "active",
        paymentStatus: "paid",
        whopPlanId: checkout.plan?.id ?? process.env[planEnvByTier[tier]],
        whopCheckoutConfigurationId: checkoutConfigurationId,
        lastWhopSyncAt: new Date(),
      })
      .where(eq(subscriptionsTable.tenantId, req.tenantId!));

    res.json({ success: true, tier });
  } catch (error) {
    req.log.error({ err: error, checkoutConfigurationId }, "Whop payment reconciliation failed");
    res.status(502).json({ error: "Unable to verify the payment right now." });
  }
});

export default router;