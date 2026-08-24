import { Router } from "express";
import { db, salesTable, productsTable, customersTable, saleItemsTable } from "@workspace/db";
import { eq, and, gte, sql, desc, lt } from "drizzle-orm";
import { requireManagerAccess } from "../middlewares/auth";

const router = Router();

// GET /dashboard/stats
router.get("/dashboard/stats", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todaySales, weekSales, monthSales, products, customers] = await Promise.all([
    db.select({
      revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(salesTable).where(and(eq(salesTable.tenantId, tenantId), gte(salesTable.createdAt, todayStart), eq(salesTable.status, "completed"))),
    db.select({
      revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
    }).from(salesTable).where(and(eq(salesTable.tenantId, tenantId), gte(salesTable.createdAt, weekStart), eq(salesTable.status, "completed"))),
    db.select({
      revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
    }).from(salesTable).where(and(eq(salesTable.tenantId, tenantId), gte(salesTable.createdAt, monthStart), eq(salesTable.status, "completed"))),
    db.select().from(productsTable).where(eq(productsTable.tenantId, tenantId)),
    db.select({ count: sql<number>`COUNT(*)` }).from(customersTable).where(eq(customersTable.tenantId, tenantId)),
  ]);

  const lowStockProducts = products.filter(p => p.stock <= p.minStock && p.stock > 0);
  const inventoryValue = products.reduce((sum, p) => sum + (parseFloat(p.costPrice ?? p.price) * p.stock), 0);

  res.json({
    todayRevenue: parseFloat(String(todaySales[0]?.revenue ?? 0)),
    weekRevenue: parseFloat(String(weekSales[0]?.revenue ?? 0)),
    monthRevenue: parseFloat(String(monthSales[0]?.revenue ?? 0)),
    totalProducts: products.length,
    totalCustomers: Number(customers[0]?.count ?? 0),
    lowStockCount: lowStockProducts.length,
    totalSalesToday: Number(todaySales[0]?.count ?? 0),
    pendingRefunds: 0,
    inventoryValue,
  });
});

// GET /dashboard/recent-sales
router.get("/dashboard/recent-sales", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const sales = await db.select().from(salesTable)
    .where(eq(salesTable.tenantId, tenantId))
    .orderBy(desc(salesTable.createdAt))
    .limit(10);

  const result = await Promise.all(sales.map(async (sale) => {
    const items = await db.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, sale.id));
    return {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      customerId: sale.customerId ?? null,
      customerName: null,
      subtotal: parseFloat(sale.subtotal),
      taxAmount: parseFloat(sale.taxAmount),
      discountAmount: parseFloat(sale.discountAmount),
      totalAmount: parseFloat(sale.totalAmount),
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      cashierId: sale.cashierId,
      cashierName: "",
      items: items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: parseFloat(i.unitPrice),
        discount: parseFloat(i.discount),
        totalPrice: parseFloat(i.totalPrice),
      })),
      tenantId: sale.tenantId,
      createdAt: sale.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

// GET /dashboard/top-products
router.get("/dashboard/top-products", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const topItems = await db.select({
    productId: saleItemsTable.productId,
    productName: saleItemsTable.productName,
    totalSold: sql<number>`COALESCE(SUM(${saleItemsTable.quantity}), 0)`,
    totalRevenue: sql<number>`COALESCE(SUM(${saleItemsTable.totalPrice}::numeric), 0)`,
  })
    .from(saleItemsTable)
    .innerJoin(salesTable, and(eq(saleItemsTable.saleId, salesTable.id), eq(salesTable.tenantId, tenantId), gte(salesTable.createdAt, monthStart)))
    .groupBy(saleItemsTable.productId, saleItemsTable.productName)
    .orderBy(desc(sql`SUM(${saleItemsTable.quantity})`))
    .limit(5);

  res.json(topItems.map(i => ({
    productId: i.productId,
    name: i.productName,
    totalSold: Number(i.totalSold),
    totalRevenue: parseFloat(String(i.totalRevenue)),
    imageUrl: null,
  })));
});

// GET /dashboard/sales-trend
router.get("/dashboard/sales-trend", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const trend = await db.select({
    date: sql<string>`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')::text`,
    revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
    count: sql<number>`COUNT(*)`,
  })
    .from(salesTable)
    .where(and(eq(salesTable.tenantId, tenantId), gte(salesTable.createdAt, thirtyDaysAgo), eq(salesTable.status, "completed")))
    .groupBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`);

  res.json(trend.map(t => ({
    date: t.date,
    revenue: parseFloat(String(t.revenue)),
    count: Number(t.count),
  })));
});

export default router;
