import { Router } from "express";
import { db, salesTable, productsTable, categoriesTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireManagerAccess } from "../middlewares/auth";

const router = Router();

// GET /reports/sales
router.get("/reports/sales", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { startDate, endDate, groupBy = "day" } = req.query as Record<string, string>;

  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate are required" });
    return;
  }

  const conditions = [
    eq(salesTable.tenantId, tenantId),
    gte(salesTable.createdAt, new Date(startDate)),
    lte(salesTable.createdAt, new Date(endDate)),
    eq(salesTable.status, "completed"),
  ];

  const [summary, trend] = await Promise.all([
    db.select({
      totalRevenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
      totalOrders: sql<number>`COUNT(*)`,
      avgOrder: sql<number>`COALESCE(AVG(${salesTable.totalAmount}::numeric), 0)`,
    }).from(salesTable).where(and(...conditions)),
    db.select({
      date: sql<string>`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')::text`,
      revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(salesTable)
      .where(and(...conditions))
      .groupBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`),
  ]);

  res.json({
    totalRevenue: parseFloat(String(summary[0]?.totalRevenue ?? 0)),
    totalOrders: Number(summary[0]?.totalOrders ?? 0),
    averageOrderValue: parseFloat(String(summary[0]?.avgOrder ?? 0)),
    totalRefunds: 0,
    data: trend.map(t => ({
      date: t.date,
      revenue: parseFloat(String(t.revenue)),
      count: Number(t.count),
    })),
  });
});

// GET /reports/inventory
router.get("/reports/inventory", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;

  const products = await db.select({ p: productsTable, catName: categoriesTable.name })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.tenantId, tenantId));

  const totalProducts = products.length;
  const totalValue = products.reduce((sum, { p }) => sum + parseFloat(p.costPrice ?? p.price) * p.stock, 0);
  const lowStockCount = products.filter(({ p }) => p.stock > 0 && p.stock <= p.minStock).length;
  const outOfStockCount = products.filter(({ p }) => p.stock === 0).length;

  // Top categories by product count and value
  const catMap = new Map<string, { productCount: number; totalValue: number }>();
  for (const { p, catName } of products) {
    const key = catName ?? "Uncategorized";
    const existing = catMap.get(key) ?? { productCount: 0, totalValue: 0 };
    catMap.set(key, {
      productCount: existing.productCount + 1,
      totalValue: existing.totalValue + parseFloat(p.costPrice ?? p.price) * p.stock,
    });
  }

  const topCategories = Array.from(catMap.entries())
    .map(([categoryName, stats]) => ({ categoryName, ...stats }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 5);

  res.json({ totalProducts, totalValue, lowStockCount, outOfStockCount, topCategories });
});

export default router;
