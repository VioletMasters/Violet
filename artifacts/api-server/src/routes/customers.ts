import { Router } from "express";
import { db, customersTable } from "@workspace/db";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /customers
router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(customersTable.tenantId, tenantId)];
  if (search) conditions.push(ilike(customersTable.firstName, `%${search}%`));

  const [customers, [{ total }]] = await Promise.all([
    db.select().from(customersTable).where(and(...conditions))
      .orderBy(desc(customersTable.createdAt))
      .limit(limitNum).offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(customersTable).where(and(...conditions)),
  ]);

  res.json({
    data: customers.map(c => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? null,
      phone: c.phone ?? null,
      loyaltyPoints: c.loyaltyPoints,
      storeCredit: parseFloat(c.storeCredit),
      totalPurchases: parseFloat(c.totalPurchases),
      totalOrders: c.totalOrders,
      notes: c.notes ?? null,
      tenantId: c.tenantId,
      createdAt: c.createdAt.toISOString(),
    })),
    total: Number(total),
    page: pageNum,
    limit: limitNum,
  });
});

// POST /customers
router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { firstName, lastName, email, phone, notes } = req.body;
  if (!firstName) {
    res.status(400).json({ error: "firstName is required" });
    return;
  }
  const [customer] = await db.insert(customersTable).values({ tenantId, firstName, lastName, email, phone, notes }).returning();
  res.status(201).json({
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    loyaltyPoints: customer.loyaltyPoints,
    storeCredit: parseFloat(customer.storeCredit),
    totalPurchases: parseFloat(customer.totalPurchases),
    totalOrders: customer.totalOrders,
    notes: customer.notes ?? null,
    tenantId: customer.tenantId,
    createdAt: customer.createdAt.toISOString(),
  });
});

// GET /customers/:id
router.get("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [customer] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId))).limit(1);
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json({
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    loyaltyPoints: customer.loyaltyPoints,
    storeCredit: parseFloat(customer.storeCredit),
    totalPurchases: parseFloat(customer.totalPurchases),
    totalOrders: customer.totalOrders,
    notes: customer.notes ?? null,
    tenantId: customer.tenantId,
    createdAt: customer.createdAt.toISOString(),
  });
});

// PATCH /customers/:id
router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { firstName, lastName, email, phone, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (notes !== undefined) updates.notes = notes;

  const [customer] = await db.update(customersTable).set(updates)
    .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId))).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json({
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    loyaltyPoints: customer.loyaltyPoints,
    storeCredit: parseFloat(customer.storeCredit),
    totalPurchases: parseFloat(customer.totalPurchases),
    totalOrders: customer.totalOrders,
    notes: customer.notes ?? null,
    tenantId: customer.tenantId,
    createdAt: customer.createdAt.toISOString(),
  });
});

// DELETE /customers/:id
router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await db.delete(customersTable).where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)));
  res.json({ success: true });
});

export default router;
