import { Router } from "express";
import { db, plansTable, subscriptionsTable, usersTable, productsTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isManagerRole, requireSession } from "../middlewares/auth";
import { refreshWhopMembershipIfStale } from "../lib/subscriptionSync";

const router = Router();

// GET /plans — public
router.get("/plans", async (req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).where(eq(plansTable.isActive, true)).orderBy(plansTable.price);
  res.json(plans.map(p => ({
    id: p.id,
    name: p.name,
    tier: p.tier,
    description: p.description ?? "",
    price: parseFloat(p.price),
    annualPrice: p.annualPrice ? parseFloat(p.annualPrice) : null,
    billingType: p.billingType,
    currency: p.currency,
    checkoutPrice: parseFloat(p.checkoutPrice),
    checkoutCurrency: p.checkoutCurrency,
    maxUsers: p.maxUsers,
    maxRegisters: p.maxRegisters,
    maxBranches: p.maxBranches,
    maxProducts: p.maxProducts,
    maxCustomers: p.maxCustomers,
    features: p.features ?? [],
    isActive: p.isActive,
    isPopular: p.isPopular,
    trialDays: p.trialDays,
  })));
});

// GET /subscription
router.get("/subscription", requireSession, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  if (!req.user || !isManagerRole(req.user.role)) {
    res.status(403).json({ error: "Only an account owner or manager can view billing." });
    return;
  }

  let [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);
  if (!sub) {
    res.status(404).json({ error: "No subscription found" });
    return;
  }

  if (sub.whopMembershipId) {
    try {
      await refreshWhopMembershipIfStale(tenantId, sub.lastWhopSyncAt, 0);
      [sub] = await db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.tenantId, tenantId))
        .limit(1);
    } catch (err) {
      req.log.warn({ err, tenantId }, "Unable to refresh Whop membership for subscription view");
    }
  }

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, sub.planId)).limit(1);

  // Usage
  const users = await db.select().from(usersTable).where(eq(usersTable.tenantId, tenantId));
  const products = await db.select().from(productsTable).where(eq(productsTable.tenantId, tenantId));
  const customers = await db.select().from(customersTable).where(eq(customersTable.tenantId, tenantId));

  res.json({
    id: sub.id,
    tenantId: sub.tenantId,
    planId: sub.planId,
    plan: plan ? {
      id: plan.id,
      name: plan.name,
      tier: plan.tier,
      description: plan.description ?? "",
      price: parseFloat(plan.price),
      annualPrice: plan.annualPrice ? parseFloat(plan.annualPrice) : null,
      billingType: plan.billingType,
      currency: plan.currency,
      checkoutPrice: parseFloat(plan.checkoutPrice),
      checkoutCurrency: plan.checkoutCurrency,
      maxUsers: plan.maxUsers,
      maxRegisters: plan.maxRegisters,
      maxBranches: plan.maxBranches,
      maxProducts: plan.maxProducts,
      maxCustomers: plan.maxCustomers,
      features: plan.features ?? [],
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      trialDays: plan.trialDays,
    } : null,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    paymentStatus: sub.paymentStatus ?? null,
    checkoutPending: Boolean(sub.pendingWhopCheckoutConfigurationId),
    lastWhopSyncAt: sub.lastWhopSyncAt?.toISOString() ?? null,
    usage: {
      users: users.length,
      products: products.length,
      customers: customers.length,
    },
  });
});

export default router;
