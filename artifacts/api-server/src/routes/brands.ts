import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { brandsTable, db, productsTable } from "@workspace/db";
import { requireManagerAccess } from "../middlewares/auth";

const router = Router();

router.get("/brands", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const brands = await db
    .select({
      brand: brandsTable,
      productCount: sql<number>`COUNT(${productsTable.id})`,
    })
    .from(brandsTable)
    .leftJoin(productsTable, and(eq(productsTable.brandId, brandsTable.id), eq(productsTable.tenantId, tenantId)))
    .where(eq(brandsTable.tenantId, tenantId))
    .groupBy(brandsTable.id)
    .orderBy(brandsTable.name);

  res.json(brands.map(({ brand, productCount }) => ({
    id: brand.id,
    name: brand.name,
    description: brand.description ?? null,
    tenantId: brand.tenantId,
    productCount: Number(productCount),
    createdAt: brand.createdAt.toISOString(),
  })));
});

router.post("/brands", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { name, description } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "Brand name is required" });
    return;
  }

  const [brand] = await db.insert(brandsTable).values({
    tenantId,
    name: name.trim(),
    description: description?.trim() || undefined,
  }).returning();

  res.status(201).json({
    id: brand.id,
    name: brand.name,
    description: brand.description ?? null,
    tenantId: brand.tenantId,
    productCount: 0,
    createdAt: brand.createdAt.toISOString(),
  });
});

router.patch("/brands/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, description } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) {
      res.status(400).json({ error: "Brand name is required" });
      return;
    }
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description?.trim() || null;

  const [brand] = await db.update(brandsTable)
    .set(updates)
    .where(and(eq(brandsTable.id, id), eq(brandsTable.tenantId, tenantId)))
    .returning();

  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  res.json({
    id: brand.id,
    name: brand.name,
    description: brand.description ?? null,
    tenantId: brand.tenantId,
    productCount: 0,
    createdAt: brand.createdAt.toISOString(),
  });
});

router.delete("/brands/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [{ productCount }] = await db
    .select({ productCount: sql<number>`COUNT(*)` })
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tenantId), eq(productsTable.brandId, id)));

  if (Number(productCount) > 0) {
    res.status(409).json({ error: "This brand is assigned to products. Reassign those products before deleting it." });
    return;
  }

  const [deleted] = await db.delete(brandsTable)
    .where(and(eq(brandsTable.id, id), eq(brandsTable.tenantId, tenantId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  res.json({ success: true });
});

export default router;