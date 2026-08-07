import { Router } from "express";
import { db, tenantsTable, usersTable, plansTable, subscriptionsTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/auth";

const router = Router();

// GET /admin/stats
router.get("/admin/stats", requireSuperAdmin, async (req, res): Promise<void> => {
  const [tenantStats, planStats] = await Promise.all([
    db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${tenantsTable.status} = 'active' THEN 1 ELSE 0 END)`,
      trial: sql<number>`SUM(CASE WHEN ${tenantsTable.status} = 'trial' THEN 1 ELSE 0 END)`,
      suspended: sql<number>`SUM(CASE WHEN ${tenantsTable.status} = 'suspended' THEN 1 ELSE 0 END)`,
    }).from(tenantsTable),
    db.select({
      planName: plansTable.name,
      count: sql<number>`COUNT(${subscriptionsTable.id})`,
      price: plansTable.price,
      billingType: plansTable.billingType,
    }).from(plansTable)
      .leftJoin(subscriptionsTable, eq(subscriptionsTable.planId, plansTable.id))
      .groupBy(plansTable.id),
  ]);

  const stats = tenantStats[0];
  const totalTenants = Number(stats?.total ?? 0);
  const activeTenants = Number(stats?.active ?? 0);
  const trialTenants = Number(stats?.trial ?? 0);
  const suspendedTenants = Number(stats?.suspended ?? 0);

  // MRR calculation (monthly plans)
  const mrr = planStats.reduce((sum, p) => {
    if (p.billingType === "monthly") return sum + parseFloat(p.price) * Number(p.count);
    return sum;
  }, 0);

  const revenueByPlan = planStats.map(p => ({
    planName: p.planName,
    tenantCount: Number(p.count),
    revenue: parseFloat(p.price) * Number(p.count),
  }));

  res.json({
    totalTenants,
    activeTenants,
    trialTenants,
    suspendedTenants,
    mrr,
    arr: mrr * 12,
    newTenantsThisMonth: 0,
    churnRate: 0,
    totalRevenue: mrr,
    revenueByPlan,
  });
});

// GET /admin/tenants
router.get("/admin/tenants", requireSuperAdmin, async (req, res): Promise<void> => {
  const { search, status, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(tenantsTable.status, status) as any);
  if (search) conditions.push(ilike(tenantsTable.name, `%${search}%`) as any);

  const [tenants, [{ total }]] = await Promise.all([
    db.select().from(tenantsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limitNum).offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(tenantsTable)
      .where(conditions.length ? and(...conditions) : undefined),
  ]);

  const result = await Promise.all(tenants.map(async (t) => {
    const [plan] = t.planId
      ? await db.select().from(plansTable).where(eq(plansTable.id, t.planId)).limit(1)
      : [null];
    const [{ userCount }] = await db.select({ userCount: sql<number>`COUNT(*)` })
      .from(usersTable).where(eq(usersTable.tenantId, t.id));

    return {
      id: t.id,
      name: t.name,
      email: t.email,
      status: t.status,
      planId: t.planId ?? "",
      planName: plan?.name ?? "Free",
      userCount: Number(userCount),
      productCount: 0,
      createdAt: t.createdAt.toISOString(),
    };
  }));

  res.json({ data: result, total: Number(total), page: pageNum, limit: limitNum });
});

// GET /admin/tenants/:id
router.get("/admin/tenants/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const [plan] = tenant.planId
    ? await db.select().from(plansTable).where(eq(plansTable.id, tenant.planId)).limit(1)
    : [null];
  const [{ userCount }] = await db.select({ userCount: sql<number>`COUNT(*)` })
    .from(usersTable).where(eq(usersTable.tenantId, tenant.id));

  res.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    status: tenant.status,
    planId: tenant.planId ?? "",
    planName: plan?.name ?? "Free",
    userCount: Number(userCount),
    productCount: 0,
    createdAt: tenant.createdAt.toISOString(),
  });
});

// PATCH /admin/tenants/:id
router.patch("/admin/tenants/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status, planId } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (planId !== undefined) updates.planId = planId;

  const [tenant] = await db.update(tenantsTable).set(updates)
    .where(eq(tenantsTable.id, id)).returning();
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [plan] = tenant.planId
    ? await db.select().from(plansTable).where(eq(plansTable.id, tenant.planId)).limit(1)
    : [null];

  res.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    status: tenant.status,
    planId: tenant.planId ?? "",
    planName: plan?.name ?? "Free",
    userCount: 0,
    productCount: 0,
    createdAt: tenant.createdAt.toISOString(),
  });
});

// GET /admin/plans
router.get("/admin/plans", requireSuperAdmin, async (req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.price);
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

// POST /admin/plans
router.post("/admin/plans", requireSuperAdmin, async (req, res): Promise<void> => {
  const { name, tier, description, price, annualPrice, billingType, maxUsers, maxRegisters, maxBranches, maxProducts, maxCustomers, features, trialDays, isPopular } = req.body;
  if (!name || !tier || price === undefined || !billingType) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const [plan] = await db.insert(plansTable).values({
    name, tier, description, price: String(price),
    annualPrice: annualPrice ? String(annualPrice) : undefined,
    billingType, maxUsers, maxRegisters, maxBranches, maxProducts, maxCustomers,
    features: features ?? [], trialDays: trialDays ?? 0, isPopular: isPopular ?? false,
  }).returning();
  res.status(201).json({
    id: plan.id, name: plan.name, tier: plan.tier, description: plan.description ?? "",
    price: parseFloat(plan.price),
    annualPrice: plan.annualPrice ? parseFloat(plan.annualPrice) : null,
    billingType: plan.billingType,
    maxUsers: plan.maxUsers, maxRegisters: plan.maxRegisters, maxBranches: plan.maxBranches,
    maxProducts: plan.maxProducts, maxCustomers: plan.maxCustomers,
    features: plan.features ?? [], isActive: plan.isActive, isPopular: plan.isPopular, trialDays: plan.trialDays,
  });
});

// PATCH /admin/plans/:id
router.patch("/admin/plans/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, description, price, annualPrice, maxUsers, maxRegisters, maxBranches, maxProducts, maxCustomers, features, isActive, isPopular, trialDays } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = String(price);
  if (annualPrice !== undefined) updates.annualPrice = annualPrice ? String(annualPrice) : null;
  if (maxUsers !== undefined) updates.maxUsers = maxUsers;
  if (maxRegisters !== undefined) updates.maxRegisters = maxRegisters;
  if (maxBranches !== undefined) updates.maxBranches = maxBranches;
  if (maxProducts !== undefined) updates.maxProducts = maxProducts;
  if (maxCustomers !== undefined) updates.maxCustomers = maxCustomers;
  if (features !== undefined) updates.features = features;
  if (isActive !== undefined) updates.isActive = isActive;
  if (isPopular !== undefined) updates.isPopular = isPopular;
  if (trialDays !== undefined) updates.trialDays = trialDays;

  const [plan] = await db.update(plansTable).set(updates).where(eq(plansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({
    id: plan.id, name: plan.name, tier: plan.tier, description: plan.description ?? "",
    price: parseFloat(plan.price),
    annualPrice: plan.annualPrice ? parseFloat(plan.annualPrice) : null,
    billingType: plan.billingType,
    maxUsers: plan.maxUsers, maxRegisters: plan.maxRegisters, maxBranches: plan.maxBranches,
    maxProducts: plan.maxProducts, maxCustomers: plan.maxCustomers,
    features: plan.features ?? [], isActive: plan.isActive, isPopular: plan.isPopular, trialDays: plan.trialDays,
  });
});

export default router;
