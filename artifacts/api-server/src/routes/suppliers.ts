import { Router } from "express";
import { db, suppliersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /suppliers
router.get("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.tenantId, tenantId));
  res.json(suppliers.map(s => ({
    id: s.id,
    name: s.name,
    contactName: s.contactName ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
    address: s.address ?? null,
    notes: s.notes ?? null,
    tenantId: s.tenantId,
    createdAt: s.createdAt.toISOString(),
  })));
});

// POST /suppliers
router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { name, contactName, email, phone, address, notes } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [sup] = await db.insert(suppliersTable).values({ tenantId, name, contactName, email, phone, address, notes }).returning();
  res.status(201).json({
    id: sup.id,
    name: sup.name,
    contactName: sup.contactName ?? null,
    email: sup.email ?? null,
    phone: sup.phone ?? null,
    address: sup.address ?? null,
    notes: sup.notes ?? null,
    tenantId: sup.tenantId,
    createdAt: sup.createdAt.toISOString(),
  });
});

// PATCH /suppliers/:id
router.patch("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, contactName, email, phone, address, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (contactName !== undefined) updates.contactName = contactName;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (address !== undefined) updates.address = address;
  if (notes !== undefined) updates.notes = notes;

  const [sup] = await db.update(suppliersTable).set(updates)
    .where(and(eq(suppliersTable.id, id), eq(suppliersTable.tenantId, tenantId))).returning();
  if (!sup) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  res.json({
    id: sup.id,
    name: sup.name,
    contactName: sup.contactName ?? null,
    email: sup.email ?? null,
    phone: sup.phone ?? null,
    address: sup.address ?? null,
    notes: sup.notes ?? null,
    tenantId: sup.tenantId,
    createdAt: sup.createdAt.toISOString(),
  });
});

export default router;
