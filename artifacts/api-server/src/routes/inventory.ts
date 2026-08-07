import { Router } from "express";
import { db, productsTable, categoriesTable, inventoryMovementsTable } from "@workspace/db";
import { eq, and, ilike, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function getStockStatus(stock: number, minStock: number): string {
  if (stock === 0) return "out_of_stock";
  if (stock <= minStock) return "low_stock";
  return "in_stock";
}

// GET /inventory
router.get("/inventory", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(productsTable.tenantId, tenantId)];
  if (search) conditions.push(ilike(productsTable.name, `%${search}%`));

  const [rows, [{ total }]] = await Promise.all([
    db.select({ p: productsTable, catName: categoriesTable.name })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(...conditions))
      .limit(limitNum).offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(productsTable).where(and(...conditions)),
  ]);

  res.json({
    data: rows.map(({ p, catName }) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      categoryName: catName ?? null,
      stock: p.stock,
      minStock: p.minStock,
      status: getStockStatus(p.stock, p.minStock),
      costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
      price: parseFloat(p.price),
    })),
    total: Number(total),
    page: pageNum,
    limit: limitNum,
  });
});

// GET /inventory/low-stock
router.get("/inventory/low-stock", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const rows = await db.select({ p: productsTable, catName: categoriesTable.name })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(and(eq(productsTable.tenantId, tenantId), lte(productsTable.stock, productsTable.minStock)));

  res.json(rows.map(({ p, catName }) => ({
    productId: p.id,
    productName: p.name,
    sku: p.sku,
    categoryName: catName ?? null,
    stock: p.stock,
    minStock: p.minStock,
    status: getStockStatus(p.stock, p.minStock),
    costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
    price: parseFloat(p.price),
  })));
});

// POST /inventory/adjust
router.post("/inventory/adjust", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const userId = req.user!.id;
  const { productId, adjustment, reason, note } = req.body;

  if (!productId || adjustment === undefined || !reason) {
    res.status(400).json({ error: "productId, adjustment, and reason are required" });
    return;
  }

  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId))).limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const newStock = Math.max(0, product.stock + Number(adjustment));
  await Promise.all([
    db.update(productsTable).set({ stock: newStock }).where(eq(productsTable.id, productId)),
    db.insert(inventoryMovementsTable).values({
      tenantId,
      productId,
      adjustment: Number(adjustment),
      reason,
      note,
      createdBy: userId,
    }),
  ]);

  const [cat] = product.categoryId
    ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId)).limit(1)
    : [];

  res.json({
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    categoryName: cat?.name ?? null,
    stock: newStock,
    minStock: product.minStock,
    status: getStockStatus(newStock, product.minStock),
    costPrice: product.costPrice ? parseFloat(product.costPrice) : null,
    price: parseFloat(product.price),
  });
});

export default router;
