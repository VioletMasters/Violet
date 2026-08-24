import { Router } from "express";
import { db, productsTable, categoriesTable } from "@workspace/db";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import { requireAuth, requireManagerAccess } from "../middlewares/auth";

const router = Router();

// GET /products
router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { search, categoryId, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(productsTable.tenantId, tenantId)];
  const searchTerm = search?.replace(/[\r\n]+/g, "").trim();
  if (searchTerm) {
    const searchCondition = or(
      ilike(productsTable.name, `%${searchTerm}%`),
      ilike(productsTable.sku, `%${searchTerm}%`),
      ilike(productsTable.barcode, `%${searchTerm}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));

  const [products, [{ total }]] = await Promise.all([
    db.select({ p: productsTable, catName: categoriesTable.name })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(...conditions))
      .orderBy(desc(productsTable.createdAt))
      .limit(limitNum)
      .offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(productsTable).where(and(...conditions)),
  ]);

  res.json({
    data: products.map(({ p, catName }) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      sku: p.sku,
      barcode: p.barcode ?? null,
      price: parseFloat(p.price),
      costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
      stock: p.stock,
      minStock: p.minStock,
      categoryId: p.categoryId ?? null,
      categoryName: catName ?? null,
      imageUrl: p.imageUrl ?? null,
      tenantId: p.tenantId,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
    })),
    total: Number(total),
    page: pageNum,
    limit: limitNum,
  });
});

// POST /products
router.post("/products", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { name, description, sku, barcode, price, costPrice, stock = 0, minStock = 5, categoryId, imageUrl } = req.body;

  if (!name || !sku || price === undefined) {
    res.status(400).json({ error: "name, sku, and price are required" });
    return;
  }

  const [product] = await db.insert(productsTable).values({
    tenantId,
    name,
    description,
    sku,
    barcode,
    price: String(price),
    costPrice: costPrice ? String(costPrice) : undefined,
    stock: Number(stock),
    minStock: Number(minStock),
    categoryId: categoryId || undefined,
    imageUrl,
  }).returning();

  const [cat] = categoryId
    ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId)).limit(1)
    : [];

  res.status(201).json({
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    sku: product.sku,
    barcode: product.barcode ?? null,
    price: parseFloat(product.price),
    costPrice: product.costPrice ? parseFloat(product.costPrice) : null,
    stock: product.stock,
    minStock: product.minStock,
    categoryId: product.categoryId ?? null,
    categoryName: cat?.name ?? null,
    imageUrl: product.imageUrl ?? null,
    tenantId: product.tenantId,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  });
});

// GET /products/:id
router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [row] = await db.select({ p: productsTable, catName: categoriesTable.name })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(and(eq(productsTable.id, id), eq(productsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const { p, catName } = row;
  res.json({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    sku: p.sku,
    barcode: p.barcode ?? null,
    price: parseFloat(p.price),
    costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
    stock: p.stock,
    minStock: p.minStock,
    categoryId: p.categoryId ?? null,
    categoryName: catName ?? null,
    imageUrl: p.imageUrl ?? null,
    tenantId: p.tenantId,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  });
});

// PATCH /products/:id
router.patch("/products/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, description, sku, barcode, price, costPrice, stock, minStock, categoryId, imageUrl, isActive } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (sku !== undefined) updates.sku = sku;
  if (barcode !== undefined) updates.barcode = barcode;
  if (price !== undefined) updates.price = String(price);
  if (costPrice !== undefined) updates.costPrice = costPrice ? String(costPrice) : null;
  if (stock !== undefined) updates.stock = Number(stock);
  if (minStock !== undefined) updates.minStock = Number(minStock);
  if (categoryId !== undefined) updates.categoryId = categoryId || null;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (isActive !== undefined) updates.isActive = isActive;

  const [product] = await db.update(productsTable)
    .set(updates)
    .where(and(eq(productsTable.id, id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [cat] = product.categoryId
    ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId)).limit(1)
    : [];

  res.json({
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    sku: product.sku,
    barcode: product.barcode ?? null,
    price: parseFloat(product.price),
    costPrice: product.costPrice ? parseFloat(product.costPrice) : null,
    stock: product.stock,
    minStock: product.minStock,
    categoryId: product.categoryId ?? null,
    categoryName: cat?.name ?? null,
    imageUrl: product.imageUrl ?? null,
    tenantId: product.tenantId,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  });
});

// DELETE /products/:id
router.delete("/products/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await db.delete(productsTable).where(and(eq(productsTable.id, id), eq(productsTable.tenantId, tenantId)));
  res.json({ success: true });
});

export default router;
