import { Router } from "express";
import { db, salesTable, productsTable, customersTable, saleItemsTable, salePaymentsTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql, desc, lt, inArray } from "drizzle-orm";
import { requireManagerAccess } from "../middlewares/auth";
import { summarizeCashTender } from "../lib/cashTender";

const router = Router();

export async function getDashboardStats(tenantId: string, now = new Date()) {
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
  const inventoryCostValue = products.reduce((sum, p) => sum + (parseFloat(p.costPrice ?? "0") * p.stock), 0);
  const inventoryRetailValue = products.reduce((sum, p) => sum + (parseFloat(p.price) * p.stock), 0);
  const inventoryMissingCostCount = products.filter((p) => p.stock > 0 && p.costPrice == null).length;

  return {
    todayRevenue: parseFloat(String(todaySales[0]?.revenue ?? 0)),
    weekRevenue: parseFloat(String(weekSales[0]?.revenue ?? 0)),
    monthRevenue: parseFloat(String(monthSales[0]?.revenue ?? 0)),
    totalProducts: products.length,
    totalCustomers: Number(customers[0]?.count ?? 0),
    lowStockCount: lowStockProducts.length,
    totalSalesToday: Number(todaySales[0]?.count ?? 0),
    pendingRefunds: 0,
    inventoryValue: inventoryCostValue,
    inventoryCostValue,
    inventoryRetailValue,
    inventoryProjectedGrossProfit: inventoryMissingCostCount === 0 ? inventoryRetailValue - inventoryCostValue : null,
    inventoryMissingCostCount,
  };
}

// GET /dashboard/stats
router.get("/dashboard/stats", requireManagerAccess, async (req, res): Promise<void> => {
  res.json(await getDashboardStats(req.tenantId!));
});

export async function getRecentSales(tenantId: string) {
  const sales = await db.select({
    sale: salesTable,
    customerFirstName: customersTable.firstName,
    customerLastName: customersTable.lastName,
    cashierFirstName: usersTable.firstName,
    cashierLastName: usersTable.lastName,
  }).from(salesTable)
    .leftJoin(customersTable, and(
      eq(salesTable.customerId, customersTable.id),
      eq(customersTable.tenantId, tenantId),
    ))
    .leftJoin(usersTable, and(
      eq(salesTable.cashierId, usersTable.id),
      eq(usersTable.tenantId, tenantId),
    ))
    .where(eq(salesTable.tenantId, tenantId))
    .orderBy(desc(salesTable.createdAt))
    .limit(10);

  const payments = sales.length === 0 ? [] : await db.select({
    saleId: salePaymentsTable.saleId,
    method: salePaymentsTable.method,
    amount: salePaymentsTable.amount,
    tenderedAmount: salePaymentsTable.tenderedAmount,
  }).from(salePaymentsTable).where(and(
    eq(salePaymentsTable.tenantId, tenantId),
    inArray(salePaymentsTable.saleId, sales.map(({ sale }) => sale.id)),
    eq(salePaymentsTable.method, "cash"),
  ));
  const paymentsBySale = new Map<string, typeof payments>();
  for (const payment of payments) {
    paymentsBySale.set(payment.saleId, [...(paymentsBySale.get(payment.saleId) ?? []), payment]);
  }

  const items = sales.length === 0 ? [] : await db.select({
    item: saleItemsTable,
  }).from(saleItemsTable)
    .innerJoin(salesTable, and(
      eq(saleItemsTable.saleId, salesTable.id),
      eq(salesTable.tenantId, tenantId),
    ))
    .where(and(
      inArray(saleItemsTable.saleId, sales.map(({ sale }) => sale.id)),
      eq(saleItemsTable.isVoided, false),
    ));
  const itemsBySale = new Map<string, typeof items>();
  for (const item of items) {
    const saleItems = itemsBySale.get(item.item.saleId) ?? [];
    saleItems.push(item);
    itemsBySale.set(item.item.saleId, saleItems);
  }

  const result = sales.map(({ sale, customerFirstName, customerLastName, cashierFirstName, cashierLastName }) => {
    const saleItems = itemsBySale.get(sale.id) ?? [];
    const cashTender = summarizeCashTender(paymentsBySale.get(sale.id) ?? [], {
      paymentMethod: sale.paymentMethod,
      totalAmount: sale.totalAmount,
      cashTendered: sale.cashTendered,
    });
    return {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      customerId: sale.customerId ?? null,
      customerName: customerFirstName && customerLastName
        ? `${customerFirstName} ${customerLastName}`
        : null,
      subtotal: parseFloat(sale.subtotal),
      taxAmount: parseFloat(sale.taxAmount),
      discountAmount: parseFloat(sale.discountAmount),
      totalAmount: parseFloat(sale.totalAmount),
      cashReceived: cashTender?.received ?? null,
      changeDue: cashTender?.changeDue ?? null,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      cashierId: sale.cashierId,
      cashierName: cashierFirstName && cashierLastName
        ? `${cashierFirstName} ${cashierLastName}`
        : "",
      items: saleItems.map(({ item }) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice),
        discount: parseFloat(item.discount),
        totalPrice: parseFloat(item.totalPrice),
      })),
      tenantId: sale.tenantId,
      createdAt: sale.createdAt.toISOString(),
    };
  });

  return result;
}

// GET /dashboard/recent-sales
router.get("/dashboard/recent-sales", requireManagerAccess, async (req, res): Promise<void> => {
  res.json(await getRecentSales(req.tenantId!));
});

// GET /dashboard/top-products
export async function getTopProducts(tenantId: string, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const topItems = await db.select({
    productId: saleItemsTable.productId,
    productName: saleItemsTable.productName,
    totalSold: sql<number>`COALESCE(SUM(${saleItemsTable.quantity}), 0)`,
    totalRevenue: sql<number>`COALESCE(SUM(${saleItemsTable.totalPrice}::numeric), 0)`,
  })
    .from(saleItemsTable)
    .innerJoin(salesTable, and(eq(saleItemsTable.saleId, salesTable.id), eq(salesTable.tenantId, tenantId), gte(salesTable.createdAt, monthStart)))
    .where(eq(saleItemsTable.isVoided, false))
    .groupBy(saleItemsTable.productId, saleItemsTable.productName)
    .orderBy(desc(sql`SUM(${saleItemsTable.quantity})`))
    .limit(5);

  return topItems.map(i => ({
    productId: i.productId,
    name: i.productName,
    totalSold: Number(i.totalSold),
    totalRevenue: parseFloat(String(i.totalRevenue)),
    imageUrl: null,
  }));
}

router.get("/dashboard/top-products", requireManagerAccess, async (req, res): Promise<void> => {
  res.json(await getTopProducts(req.tenantId!));
});

// GET /dashboard/sales-trend
export async function getSalesTrend(tenantId: string, now = new Date()) {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const trend = await db.select({
    date: sql<string>`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')::text`,
    revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
    count: sql<number>`COUNT(*)`,
  })
    .from(salesTable)
    .where(and(eq(salesTable.tenantId, tenantId), gte(salesTable.createdAt, thirtyDaysAgo), eq(salesTable.status, "completed")))
    .groupBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`);

  return trend.map(t => ({
    date: t.date,
    revenue: parseFloat(String(t.revenue)),
    count: Number(t.count),
  }));
}

router.get("/dashboard/sales-trend", requireManagerAccess, async (req, res): Promise<void> => {
  res.json(await getSalesTrend(req.tenantId!));
});

export default router;
