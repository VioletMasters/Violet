import { Router } from "express";
import { db, salesTable, saleItemsTable, productsTable, customersTable, settingsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireAuth, requireManagerAccess } from "../middlewares/auth";

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
router.get("/sales", requireManagerAccess, async (req, res): Promise<void> => {
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
  const { customerId, items, paymentMethod, cashTendered, note } = req.body;

  if (!Array.isArray(items) || items.length === 0 || typeof paymentMethod !== "string") {
    res.status(400).json({ error: "items and paymentMethod are required" });
    return;
  }

  const paymentMethods = new Set(["cash", "card", "bank_transfer", "store_credit", "gift_card", "mixed"]);
  if (!paymentMethods.has(paymentMethod)) {
    res.status(400).json({ error: "Unsupported payment method" });
    return;
  }

  const inputItems = items as Array<{ productId?: unknown; quantity?: unknown; discount?: unknown }>;
  if (inputItems.some((item) => typeof item.productId !== "string" || !Number.isInteger(item.quantity) || Number(item.quantity) <= 0)) {
    res.status(400).json({ error: "Each item requires a productId and a positive whole-number quantity" });
    return;
  }

  const productIds = inputItems.map((item) => item.productId as string);
  if (new Set(productIds).size !== productIds.length) {
    res.status(400).json({ error: "Each product can only appear once in a sale" });
    return;
  }

  const [products, settings, customer] = await Promise.all([
    db.select().from(productsTable)
      .where(and(eq(productsTable.tenantId, tenantId), inArray(productsTable.id, productIds))),
    db.select().from(settingsTable).where(eq(settingsTable.tenantId, tenantId)).limit(1),
    typeof customerId === "string" && customerId
      ? db.select().from(customersTable)
        .where(and(eq(customersTable.id, customerId), eq(customersTable.tenantId, tenantId))).limit(1)
      : Promise.resolve([]),
  ]);

  if (products.length !== productIds.length) {
    res.status(400).json({ error: "One or more products are unavailable for this business" });
    return;
  }

  if (customerId && !customer[0]) {
    res.status(400).json({ error: "Customer is unavailable for this business" });
    return;
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const lineItems = inputItems.map((item) => {
    const product = productsById.get(item.productId as string)!;
    const quantity = Number(item.quantity);
    const unitPrice = Number(product.price);
    const discount = Number(item.discount ?? 0);

    if (!Number.isFinite(discount) || discount < 0 || discount > unitPrice * quantity || quantity > product.stock) {
      return null;
    }

    return {
      product,
      quantity,
      unitPrice,
      discount,
      totalPrice: unitPrice * quantity - discount,
    };
  });

  if (lineItems.some((item) => item === null)) {
    res.status(400).json({ error: "One or more sale items have an invalid discount or unavailable quantity" });
    return;
  }

  const validLineItems = lineItems as Array<NonNullable<(typeof lineItems)[number]>>;
  const subtotal = validLineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = validLineItems.reduce((sum, item) => sum + item.discount, 0);
  const configuredTaxRate = Number(settings[0]?.taxRate ?? 0);
  const taxAmount = Number.isFinite(configuredTaxRate) ? subtotal * (configuredTaxRate / 100) : 0;
  const totalAmount = subtotal + taxAmount;

  const [sale] = await db.insert(salesTable).values({
    tenantId,
    receiptNumber: generateReceiptNumber(),
    customerId: typeof customerId === "string" && customerId ? customerId : undefined,
    cashierId,
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    discountAmount: String(discountAmount),
    totalAmount: String(totalAmount),
    paymentMethod,
    status: "completed",
    cashTendered: Number.isFinite(Number(cashTendered)) ? String(cashTendered) : undefined,
    note,
  }).returning();

  // Insert items and update stock using the tenant-scoped prices resolved above.
  await Promise.all(validLineItems.map(async (item) => {
    await db.insert(saleItemsTable).values({
      saleId: sale.id,
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      discount: String(item.discount),
      totalPrice: String(item.totalPrice),
    });

    await db.update(productsTable)
      .set({ stock: Math.max(0, item.product.stock - item.quantity) })
      .where(and(eq(productsTable.id, item.product.id), eq(productsTable.tenantId, tenantId)));
  }));

  // Update customer totals only for the validated tenant-scoped customer.
  if (customer[0]) {
    await db.update(customersTable).set({
      totalPurchases: String(parseFloat(customer[0].totalPurchases) + totalAmount),
      totalOrders: customer[0].totalOrders + 1,
      loyaltyPoints: customer[0].loyaltyPoints + Math.floor(totalAmount),
    }).where(and(eq(customersTable.id, customer[0].id), eq(customersTable.tenantId, tenantId)));
  }

  const result = await buildSaleResponse(sale);
  res.status(201).json(result);
});

// GET /sales/:id
router.get("/sales/:id", requireManagerAccess, async (req, res): Promise<void> => {
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
router.post("/sales/:id/refund", requireManagerAccess, async (req, res): Promise<void> => {
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
