import { Router } from "express";
import { db, salesTable, saleItemsTable, productsTable, customersTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function generateReceiptNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `RCP-${ts}-${rand}`;
}

async function buildSaleResponse(sale: typeof salesTable.$inferSelect) {
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
}

// GET /sales
router.get("/sales", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { startDate, endDate, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(salesTable.tenantId, tenantId)];
  if (startDate) conditions.push(gte(salesTable.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(salesTable.createdAt, new Date(endDate)));

  const [sales, [{ total }]] = await Promise.all([
    db.select().from(salesTable).where(and(...conditions))
      .orderBy(desc(salesTable.createdAt))
      .limit(limitNum).offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(salesTable).where(and(...conditions)),
  ]);

  const data = await Promise.all(sales.map(buildSaleResponse));
  res.json({ data, total: Number(total), page: pageNum, limit: limitNum });
});

// POST /sales
router.post("/sales", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const cashierId = req.user!.id;
  const { customerId, items, paymentMethod, discountAmount = 0, taxAmount = 0, totalAmount, cashTendered, note } = req.body;

  if (!items?.length || !paymentMethod || totalAmount === undefined) {
    res.status(400).json({ error: "items, paymentMethod, and totalAmount are required" });
    return;
  }

  const subtotal = items.reduce((sum: number, item: { unitPrice: number; quantity: number; discount?: number }) =>
    sum + (item.unitPrice * item.quantity - (item.discount ?? 0)), 0);

  const [sale] = await db.insert(salesTable).values({
    tenantId,
    receiptNumber: generateReceiptNumber(),
    customerId: customerId || undefined,
    cashierId,
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    discountAmount: String(discountAmount),
    totalAmount: String(totalAmount),
    paymentMethod,
    status: "completed",
    cashTendered: cashTendered ? String(cashTendered) : undefined,
    note,
  }).returning();

  // Insert items and update stock
  await Promise.all(items.map(async (item: { productId: string; quantity: number; unitPrice: number; discount?: number }) => {
    const totalPrice = item.unitPrice * item.quantity - (item.discount ?? 0);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
    const productName = product?.name ?? "Unknown Product";

    await db.insert(saleItemsTable).values({
      saleId: sale.id,
      productId: item.productId,
      productName,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      discount: String(item.discount ?? 0),
      totalPrice: String(totalPrice),
    });

    // Update stock
    if (product) {
      await db.update(productsTable)
        .set({ stock: Math.max(0, product.stock - item.quantity) })
        .where(eq(productsTable.id, item.productId));
    }
  }));

  // Update customer totals
  if (customerId) {
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId)).limit(1);
    if (customer) {
      await db.update(customersTable).set({
        totalPurchases: String(parseFloat(customer.totalPurchases) + parseFloat(String(totalAmount))),
        totalOrders: customer.totalOrders + 1,
        loyaltyPoints: customer.loyaltyPoints + Math.floor(parseFloat(String(totalAmount))),
      }).where(eq(customersTable.id, customerId));
    }
  }

  const result = await buildSaleResponse(sale);
  res.status(201).json(result);
});

// GET /sales/:id
router.get("/sales/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [sale] = await db.select().from(salesTable)
    .where(and(eq(salesTable.id, id), eq(salesTable.tenantId, tenantId))).limit(1);
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }
  res.json(await buildSaleResponse(sale));
});

// POST /sales/:id/refund
router.post("/sales/:id/refund", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [sale] = await db.select().from(salesTable)
    .where(and(eq(salesTable.id, id), eq(salesTable.tenantId, tenantId))).limit(1);
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }
  const [updated] = await db.update(salesTable).set({ status: "refunded" })
    .where(eq(salesTable.id, id)).returning();
  res.json(await buildSaleResponse(updated));
});

export default router;
