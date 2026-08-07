import { Router } from "express";
import { db, plansTable, subscriptionsTable, usersTable, productsTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

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
router.get("/subscription", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);
  if (!sub) {
    res.status(404).json({ error: "No subscription found" });
    return;
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
    usage: {
      users: users.length,
      products: products.length,
      customers: customers.length,
    },
  });
});

export default router;
