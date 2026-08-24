import { Router } from "express";
import { brandsTable, db, productsTable, categoriesTable } from "@workspace/db";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import { requireAuth, requireManagerAccess } from "../middlewares/auth";

const router = Router();

// GET /pos/products — checkout lookup with only the fields a cashier needs.
router.get("/pos/products", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [
    eq(productsTable.tenantId, tenantId),
    eq(productsTable.isActive, true),
  ];
  const searchTerm = search?.replace(/[\r\n]+/g, "").trim();
  if (searchTerm) {
    const searchCondition = or(
      ilike(productsTable.name, `%${searchTerm}%`),
      ilike(productsTable.sku, `%${searchTerm}%`),
      ilike(productsTable.barcode, `%${searchTerm}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const [products, [{ total }]] = await Promise.all([
    db.select()
      .from(productsTable)
      .where(and(...conditions))
      .orderBy(desc(productsTable.createdAt))
      .limit(limitNum)
      .offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(productsTable).where(and(...conditions)),
  ]);

  res.json({
    data: products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? null,
      price: parseFloat(product.price),
      stock: product.stock,
      imageUrl: product.imageUrl ?? null,
    })),
    total: Number(total),
    page: pageNum,
    limit: limitNum,
  });
});

// GET /products
router.get("/products", requireManagerAccess, async (req, res): Promise<void> => {
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
    db.select({
      p: productsTable,
      catName: categoriesTable.name,
      brandName: brandsTable.name,
    })
      .from(productsTable)
      .leftJoin(categoriesTable, and(eq(productsTable.categoryId, categoriesTable.id), eq(categoriesTable.tenantId, tenantId)))
      .leftJoin(brandsTable, and(eq(productsTable.brandId, brandsTable.id), eq(brandsTable.tenantId, tenantId)))
      .where(and(...conditions))
      .orderBy(desc(productsTable.createdAt))
      .limit(limitNum)
      .offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(productsTable).where(and(...conditions)),
  ]);

  res.json({
    data: products.map(({ p, catName, brandName }) => ({
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
      brandId: p.brandId ?? null,
      brandName: brandName ?? null,
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
  const { name, description, sku, barcode, price, costPrice, stock = 0, minStock = 5, categoryId, brandId, imageUrl } = req.body;

  if (!name || !sku || price === undefined) {
    res.status(400).json({ error: "name, sku, and price are required" });
    return;
  }

  const [[category], [brand]] = await Promise.all([
    categoryId
      ? db.select().from(categoriesTable).where(and(eq(categoriesTable.id, categoryId), eq(categoriesTable.tenantId, tenantId))).limit(1)
      : Promise.resolve([]),
    brandId
      ? db.select().from(brandsTable).where(and(eq(brandsTable.id, brandId), eq(brandsTable.tenantId, tenantId))).limit(1)
      : Promise.resolve([]),
  ]);
  if (categoryId && !category) {
    res.status(400).json({ error: "Category not found for this business" });
    return;
  }
  if (brandId && !brand) {
    res.status(400).json({ error: "Brand not found for this business" });
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
    brandId: brandId || undefined,
    imageUrl,
  }).returning();

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
    categoryName: category?.name ?? null,
    brandId: product.brandId ?? null,
    brandName: brand?.name ?? null,
    imageUrl: product.imageUrl ?? null,
    tenantId: product.tenantId,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  });
});

// GET /products/:id
router.get("/products/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [row] = await db.select({
    p: productsTable,
    catName: categoriesTable.name,
    brandName: brandsTable.name,
  })
    .from(productsTable)
    .leftJoin(categoriesTable, and(eq(productsTable.categoryId, categoriesTable.id), eq(categoriesTable.tenantId, tenantId)))
    .leftJoin(brandsTable, and(eq(productsTable.brandId, brandsTable.id), eq(brandsTable.tenantId, tenantId)))
    .where(and(eq(productsTable.id, id), eq(productsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const { p, catName, brandName } = row;
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
    brandId: p.brandId ?? null,
    brandName: brandName ?? null,
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
  const { name, description, sku, barcode, price, costPrice, stock, minStock, categoryId, brandId, imageUrl, isActive } = req.body;

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
  if (brandId !== undefined) updates.brandId = brandId || null;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (isActive !== undefined) updates.isActive = isActive;

  const [[category], [brand]] = await Promise.all([
    categoryId
      ? db.select().from(categoriesTable).where(and(eq(categoriesTable.id, categoryId), eq(categoriesTable.tenantId, tenantId))).limit(1)
      : Promise.resolve([]),
    brandId
      ? db.select().from(brandsTable).where(and(eq(brandsTable.id, brandId), eq(brandsTable.tenantId, tenantId))).limit(1)
      : Promise.resolve([]),
  ]);
  if (categoryId && !category) {
    res.status(400).json({ error: "Category not found for this business" });
    return;
  }
  if (brandId && !brand) {
    res.status(400).json({ error: "Brand not found for this business" });
    return;
  }

  const [product] = await db.update(productsTable)
    .set(updates)
    .where(and(eq(productsTable.id, id), eq(productsTable.tenantId, tenantId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [catalogDetails] = await db.select({
    categoryName: categoriesTable.name,
    brandName: brandsTable.name,
  })
    .from(productsTable)
    .leftJoin(categoriesTable, and(eq(productsTable.categoryId, categoriesTable.id), eq(categoriesTable.tenantId, tenantId)))
    .leftJoin(brandsTable, and(eq(productsTable.brandId, brandsTable.id), eq(brandsTable.tenantId, tenantId)))
    .where(and(eq(productsTable.id, product.id), eq(productsTable.tenantId, tenantId)))
    .limit(1);

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
    categoryName: catalogDetails?.categoryName ?? null,
    brandId: product.brandId ?? null,
    brandName: catalogDetails?.brandName ?? null,
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
