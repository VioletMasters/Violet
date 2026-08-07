import { Router } from "express";
import { db, categoriesTable, productsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /categories
router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const cats = await db
    .select({
      c: categoriesTable,
      productCount: sql<number>`COUNT(${productsTable.id})`,
    })
    .from(categoriesTable)
    .leftJoin(productsTable, and(eq(productsTable.categoryId, categoriesTable.id), eq(productsTable.tenantId, tenantId)))
    .where(eq(categoriesTable.tenantId, tenantId))
    .groupBy(categoriesTable.id);

  res.json(cats.map(({ c, productCount }) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    color: c.color ?? null,
    tenantId: c.tenantId,
    productCount: Number(productCount),
    createdAt: c.createdAt.toISOString(),
  })));
});

// POST /categories
router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { name, description, color } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [cat] = await db.insert(categoriesTable).values({ tenantId, name, description, color }).returning();
  res.status(201).json({
    id: cat.id,
    name: cat.name,
    description: cat.description ?? null,
    color: cat.color ?? null,
    tenantId: cat.tenantId,
    productCount: 0,
    createdAt: cat.createdAt.toISOString(),
  });
});

// PATCH /categories/:id
router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, description, color } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (color !== undefined) updates.color = color;

  const [cat] = await db.update(categoriesTable).set(updates)
    .where(and(eq(categoriesTable.id, id), eq(categoriesTable.tenantId, tenantId)))
    .returning();

  if (!cat) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json({
    id: cat.id,
    name: cat.name,
    description: cat.description ?? null,
    color: cat.color ?? null,
    tenantId: cat.tenantId,
    productCount: 0,
    createdAt: cat.createdAt.toISOString(),
  });
});

// DELETE /categories/:id
router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await db.delete(categoriesTable).where(and(eq(categoriesTable.id, id), eq(categoriesTable.tenantId, tenantId)));
  res.json({ success: true });
});

export default router;
