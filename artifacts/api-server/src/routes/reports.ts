import { Router } from "express";
import {
  auditEventsTable, cashEventsTable, categoriesTable, db, purchaseOrdersTable, receiptsTable,
  refundsTable, refundItemsTable, registersTable, saleItemsTable, salePaymentsTable, salesTable,
  storesTable, productsTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, ilike, lte, ne, sql, type SQL } from "drizzle-orm";
import { requireManagerAccess } from "../middlewares/auth";
import { FINANCIAL_DEFINITIONS, toCsv, toPdf, toXlsx } from "../lib/reporting";

const router = Router();
type Query = Record<string, string | undefined>;

function filters(query: Query, tenantId: string): SQL[] {
  const conditions: SQL[] = [eq(salesTable.tenantId, tenantId)];
  if (query.startDate) conditions.push(gte(salesTable.createdAt, new Date(query.startDate)));
  if (query.endDate) conditions.push(lte(salesTable.createdAt, new Date(query.endDate)));
  if (query.storeId) conditions.push(eq(salesTable.storeId, query.storeId));
  if (query.registerId) conditions.push(eq(salesTable.registerId, query.registerId));
  if (query.cashierId) conditions.push(eq(salesTable.cashierId, query.cashierId));
  if (query.paymentMethod) conditions.push(eq(salesTable.paymentMethod, query.paymentMethod));
  return conditions;
}

function validDates(query: Query): string | null {
  if (!query.startDate || !query.endDate) return "startDate and endDate are required";
  const start = new Date(query.startDate); const end = new Date(query.endDate);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf()) || start > end) return "Invalid date range";
  return null;
}

const money = (value: unknown) => Number(Number(value ?? 0).toFixed(2));

router.get("/reports/definitions", requireManagerAccess, (_req, res) => res.json(FINANCIAL_DEFINITIONS));

// Financial summary. Queries are deliberately separated to avoid join multiplication.
router.get(["/reports/sales", "/reports/summary"], requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const error = validDates(query);
  if (error) { res.status(400).json({ error }); return; }
  const conditions = [...filters(query, req.tenantId!), ne(salesTable.status, "voided")];
  const refundConditions: SQL[] = [
    eq(refundsTable.tenantId, req.tenantId!), eq(refundsTable.status, "completed"),
    gte(refundsTable.createdAt, new Date(query.startDate!)), lte(refundsTable.createdAt, new Date(query.endDate!)),
  ];
  if (query.storeId) refundConditions.push(eq(salesTable.storeId, query.storeId));
  if (query.registerId) refundConditions.push(eq(salesTable.registerId, query.registerId));
  if (query.cashierId) refundConditions.push(eq(salesTable.cashierId, query.cashierId));
  if (query.paymentMethod) refundConditions.push(eq(salesTable.paymentMethod, query.paymentMethod));
  const [saleSummary, refunds, costs, refundCosts, payments, trend, legacy] = await Promise.all([
    db.select({
      gross: sql<string>`COALESCE(SUM(${salesTable.subtotal}::numeric + ${salesTable.discountAmount}::numeric), 0)`,
      discounts: sql<string>`COALESCE(SUM(${salesTable.discountAmount}::numeric), 0)`,
      tax: sql<string>`COALESCE(SUM(${salesTable.taxAmount}::numeric), 0)`,
      total: sql<string>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(salesTable).where(and(...conditions)),
    db.select({ amount: sql<string>`COALESCE(SUM(${refundsTable.amount}::numeric - ${refundsTable.taxAmount}::numeric), 0)`, tax: sql<string>`COALESCE(SUM(${refundsTable.taxAmount}::numeric), 0)` })
      .from(refundsTable).innerJoin(salesTable, eq(refundsTable.saleId, salesTable.id)).where(and(...refundConditions)),
    db.select({ amount: sql<string>`COALESCE(SUM(${saleItemsTable.unitCostSnapshot}::numeric * ${saleItemsTable.quantity}), 0)` })
      .from(saleItemsTable).innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id)).where(and(...conditions)),
    db.select({ amount: sql<string>`COALESCE(SUM(${refundItemsTable.costAmount}::numeric), 0)` })
      .from(refundItemsTable).innerJoin(refundsTable, eq(refundItemsTable.refundId, refundsTable.id))
      .innerJoin(salesTable, eq(refundsTable.saleId, salesTable.id)).where(and(...refundConditions)),
    db.select({ method: salePaymentsTable.method, amount: sql<string>`COALESCE(SUM(${salePaymentsTable.amount}::numeric), 0)` })
      .from(salePaymentsTable).innerJoin(salesTable, eq(salePaymentsTable.saleId, salesTable.id)).where(and(...conditions)).groupBy(salePaymentsTable.method),
    db.select({
      date: sql<string>`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')::text`,
      revenue: sql<string>`COALESCE(SUM(${salesTable.totalAmount}::numeric), 0)`, count: sql<number>`COUNT(*)`,
    }).from(salesTable).where(and(...conditions)).groupBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`).orderBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC')`),
    db.select({ missingCostLines: sql<number>`COUNT(*) FILTER (WHERE ${saleItemsTable.unitCostSnapshot} IS NULL)` })
      .from(saleItemsTable).innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id)).where(and(...conditions)),
  ]);
  const gross = money(saleSummary[0]?.gross); const discounts = money(saleSummary[0]?.discounts);
  const refundAmount = money(refunds[0]?.amount); const net = money(gross - discounts - refundAmount);
  const cogs = money(Number(costs[0]?.amount) - Number(refundCosts[0]?.amount)); const profit = money(net - cogs); const count = Number(saleSummary[0]?.count ?? 0);
  res.json({
    definitions: FINANCIAL_DEFINITIONS, grossSales: gross, discounts, refunds: refundAmount, netSales: net,
    tax: money(Number(saleSummary[0]?.tax) - Number(refunds[0]?.tax)), cogs, grossProfit: profit,
    grossMargin: net === 0 ? 0 : money((profit / net) * 100), transactions: count,
    averageSale: count ? money(Number(saleSummary[0]?.total) / count) : 0,
    paymentTotals: payments.map((p) => ({ method: p.method, amount: money(p.amount) })),
    legacy: { missingCostLines: Number(legacy[0]?.missingCostLines ?? 0), unknownAttributionIsNull: true },
    // Backward-compatible report fields.
    totalRevenue: money(saleSummary[0]?.total), totalOrders: count,
    averageOrderValue: count ? money(Number(saleSummary[0]?.total) / count) : 0, totalRefunds: refundAmount,
    data: trend.map((t) => ({ date: t.date, revenue: money(t.revenue), count: Number(t.count) })),
  });
});

router.get("/reports/transactions", requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const error = validDates(query);
  if (error) { res.status(400).json({ error }); return; }
  const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const conditions = filters(query, req.tenantId!);
  if (query.status) conditions.push(eq(salesTable.status, query.status));
  if (query.search) conditions.push(ilike(salesTable.receiptNumber, `%${query.search}%`));
  const sortColumns = { createdAt: salesTable.createdAt, totalAmount: salesTable.totalAmount, receiptNumber: salesTable.receiptNumber };
  const sort = sortColumns[query.sortBy as keyof typeof sortColumns] ?? salesTable.createdAt;
  const order = query.sortOrder === "asc" ? asc(sort) : desc(sort);
  const [rows, count] = await Promise.all([
    db.select().from(salesTable).where(and(...conditions)).orderBy(order).limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`COUNT(*)` }).from(salesTable).where(and(...conditions)),
  ]);
  res.json({ data: rows, total: Number(count[0]?.total ?? 0), page, limit });
});

router.get("/reports/products", requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const error = validDates(query);
  if (error) { res.status(400).json({ error }); return; }
  const conditions = [...filters(query, req.tenantId!), eq(salesTable.status, "completed")];
  if (query.productId) conditions.push(eq(saleItemsTable.productId, query.productId));
  if (query.categoryId) conditions.push(eq(saleItemsTable.categoryIdSnapshot, query.categoryId));
  const rows = await db.select({
    productId: saleItemsTable.productId, productName: saleItemsTable.productName,
    units: sql<number>`SUM(${saleItemsTable.quantity})`, netSales: sql<string>`SUM(${saleItemsTable.totalPrice}::numeric)`,
    cogs: sql<string>`SUM(${saleItemsTable.unitCostSnapshot}::numeric * ${saleItemsTable.quantity})`,
    missingCostLines: sql<number>`COUNT(*) FILTER (WHERE ${saleItemsTable.unitCostSnapshot} IS NULL)`,
  }).from(saleItemsTable).innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(...conditions)).groupBy(saleItemsTable.productId, saleItemsTable.productName)
    .orderBy(desc(sql`SUM(${saleItemsTable.totalPrice}::numeric)`)).limit(Math.min(500, Number(query.limit) || 100));
  res.json({ data: rows.map((r) => ({ ...r, units: Number(r.units), netSales: money(r.netSales), cogs: money(r.cogs), grossProfit: money(Number(r.netSales) - Number(r.cogs)) })) });
});

router.get("/reports/inventory", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const rows = await db.select({ product: productsTable, categoryName: categoriesTable.name }).from(productsTable)
    .leftJoin(categoriesTable, and(eq(productsTable.categoryId, categoriesTable.id), eq(categoriesTable.tenantId, tenantId)))
    .where(eq(productsTable.tenantId, tenantId));
  const totalValue = rows.reduce((sum, r) => sum + Number(r.product.costPrice ?? 0) * r.product.stock, 0);
  res.json({
    totalProducts: rows.length, totalValue: money(totalValue),
    lowStockCount: rows.filter((r) => r.product.stock > 0 && r.product.stock <= r.product.minStock).length,
    outOfStockCount: rows.filter((r) => r.product.stock === 0).length,
    data: rows.map((r) => ({ ...r.product, categoryName: r.categoryName, valuation: money(Number(r.product.costPrice ?? 0) * r.product.stock) })),
  });
});

router.get("/reports/cash", requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const error = validDates(query);
  if (error) { res.status(400).json({ error }); return; }
  const conditions: SQL[] = [eq(cashEventsTable.tenantId, req.tenantId!), gte(cashEventsTable.createdAt, new Date(query.startDate!)), lte(cashEventsTable.createdAt, new Date(query.endDate!))];
  if (query.storeId) conditions.push(eq(cashEventsTable.storeId, query.storeId));
  if (query.registerId) conditions.push(eq(cashEventsTable.registerId, query.registerId));
  const rows = await db.select({ type: cashEventsTable.type, amount: sql<string>`SUM(${cashEventsTable.amount}::numeric)`, count: sql<number>`COUNT(*)` })
    .from(cashEventsTable).where(and(...conditions)).groupBy(cashEventsTable.type);
  res.json({ data: rows.map((r) => ({ ...r, amount: money(r.amount), count: Number(r.count) })) });
});

router.get("/reports/purchasing", requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const conditions: SQL[] = [eq(purchaseOrdersTable.tenantId, req.tenantId!)];
  if (query.startDate) conditions.push(gte(purchaseOrdersTable.createdAt, new Date(query.startDate)));
  if (query.endDate) conditions.push(lte(purchaseOrdersTable.createdAt, new Date(query.endDate)));
  if (query.storeId) conditions.push(eq(purchaseOrdersTable.storeId, query.storeId));
  if (query.supplierId) conditions.push(eq(purchaseOrdersTable.supplierId, query.supplierId));
  const rows = await db.select().from(purchaseOrdersTable).where(and(...conditions)).orderBy(desc(purchaseOrdersTable.createdAt)).limit(500);
  res.json({ data: rows, totalSpend: money(rows.filter((r) => ["ordered", "partially_received", "received"].includes(r.status)).reduce((n, r) => n + Number(r.totalAmount), 0)) });
});

router.get("/reports/stores", requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const error = validDates(query);
  if (error) { res.status(400).json({ error }); return; }
  const conditions = [...filters(query, req.tenantId!), eq(salesTable.status, "completed")];
  const rows = await db.select({
    storeId: salesTable.storeId, storeName: storesTable.name, transactions: sql<number>`COUNT(*)`,
    sales: sql<string>`SUM(${salesTable.totalAmount}::numeric)`,
  }).from(salesTable).leftJoin(storesTable, and(eq(salesTable.storeId, storesTable.id), eq(storesTable.tenantId, req.tenantId!)))
    .where(and(...conditions)).groupBy(salesTable.storeId, storesTable.name).orderBy(desc(sql`SUM(${salesTable.totalAmount}::numeric)`));
  res.json({ data: rows.map((r) => ({ ...r, storeName: r.storeName ?? "Unknown (legacy)", transactions: Number(r.transactions), sales: money(r.sales) })) });
});

router.get("/reports/audit", requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const conditions: SQL[] = [eq(auditEventsTable.tenantId, req.tenantId!)];
  if (query.startDate) conditions.push(gte(auditEventsTable.createdAt, new Date(query.startDate)));
  if (query.endDate) conditions.push(lte(auditEventsTable.createdAt, new Date(query.endDate)));
  if (query.action) conditions.push(eq(auditEventsTable.action, query.action));
  if (query.entityType) conditions.push(eq(auditEventsTable.entityType, query.entityType));
  const [rows, count] = await Promise.all([
    db.select().from(auditEventsTable).where(and(...conditions)).orderBy(desc(auditEventsTable.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`COUNT(*)` }).from(auditEventsTable).where(and(...conditions)),
  ]);
  res.json({ data: rows, total: Number(count[0]?.total ?? 0), page, limit });
});

// Exports use the exact filtered transaction dataset; no synthetic rows are introduced.
router.get(["/reports/export", "/reports/export/:format"], requireManagerAccess, async (req, res): Promise<void> => {
  const query = req.query as Query; const error = validDates(query);
  if (error) { res.status(400).json({ error }); return; }
  const format = String(req.params.format ?? query.format); if (!["csv", "xlsx", "pdf"].includes(format)) { res.status(400).json({ error: "format must be csv, xlsx, or pdf" }); return; }
  const rows = await db.select({
    receiptNumber: salesTable.receiptNumber, createdAt: salesTable.createdAt, status: salesTable.status,
    storeId: salesTable.storeId, registerId: salesTable.registerId, cashierId: salesTable.cashierId,
    subtotal: salesTable.subtotal, discount: salesTable.discountAmount, tax: salesTable.taxAmount,
    total: salesTable.totalAmount, paymentMethod: salesTable.paymentMethod,
  }).from(salesTable).where(and(...filters(query, req.tenantId!))).orderBy(asc(salesTable.createdAt)).limit(100000);
  const exportRows = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  res.setHeader("Content-Disposition", `attachment; filename="violet-report.${format}"`);
  if (format === "csv") { res.type("text/csv").send(toCsv(exportRows)); return; }
  if (format === "xlsx") { res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(toXlsx(exportRows)); return; }
  res.type("application/pdf").send(toPdf([Object.keys(exportRows[0] ?? {}).join(" | "), ...exportRows.map((r) => Object.values(r).join(" | "))]));
});

export default router;