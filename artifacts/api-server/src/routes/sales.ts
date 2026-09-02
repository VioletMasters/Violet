import { Router } from "express";
import {
  auditEventsTable, cashEventsTable, customersTable, db, inventoryMovementsTable,
  refundsTable, refundItemsTable, registersTable, registerShiftsTable, saleDiscountsTable,
  saleItemsTable, salePaymentsTable, salesTable, settingsTable, storesTable, productsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireAuth, requireManagerAccess } from "../middlewares/auth";

const router = Router();

function generateReceiptNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `RCP-${ts}-${rand}`;
}

async function buildSaleResponse(sale: typeof salesTable.$inferSelect) {
  const [items, payments] = await Promise.all([
    db.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, sale.id)),
    db.select().from(salePaymentsTable).where(and(eq(salePaymentsTable.saleId, sale.id), eq(salePaymentsTable.tenantId, sale.tenantId))),
  ]);
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
    storeId: sale.storeId ?? null,
    registerId: sale.registerId ?? null,
    shiftId: sale.shiftId ?? null,
    payments: payments.map((payment) => ({
      id: payment.id, method: payment.method, amount: Number(payment.amount),
      tenderedAmount: payment.tenderedAmount == null ? null : Number(payment.tenderedAmount),
      reference: payment.reference,
    })),
    items: items.map(i => ({
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: parseFloat(i.unitPrice),
      discount: parseFloat(i.discount),
      totalPrice: parseFloat(i.totalPrice),
      unitCostSnapshot: i.unitCostSnapshot == null ? null : Number(i.unitCostSnapshot),
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
  const { customerId, items, paymentMethod, payments, cashTendered, note, storeId, registerId, shiftId } = req.body;
  const idempotencyKey = typeof req.body?.idempotencyKey === "string"
    ? req.body.idempotencyKey.trim()
    : "";

  if (!Array.isArray(items) || items.length === 0 || typeof paymentMethod !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    res.status(400).json({ error: "items, paymentMethod, and a valid idempotencyKey are required" });
    return;
  }

  const [previousSale] = await db.select().from(salesTable).where(and(
    eq(salesTable.tenantId, tenantId),
    eq(salesTable.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (previousSale) {
    res.status(200).json(await buildSaleResponse(previousSale));
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
  const parsedCashTendered = cashTendered === undefined || cashTendered === null || cashTendered === ""
    ? undefined
    : Number(cashTendered);

  if (paymentMethod === "cash" && parsedCashTendered !== undefined
    && (!Number.isFinite(parsedCashTendered) || parsedCashTendered < totalAmount)) {
    res.status(400).json({ error: "Cash tendered must cover the total amount due" });
    return;
  }

  const tenderInputs = Array.isArray(payments) ? payments as Array<{ method?: unknown; amount?: unknown; tenderedAmount?: unknown; reference?: unknown }> : null;
  if (tenderInputs && (tenderInputs.length === 0 || tenderInputs.some((p) =>
    typeof p.method !== "string" || !paymentMethods.has(p.method) || !Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0
  ) || Math.abs(tenderInputs.reduce((sum, p) => sum + Number(p.amount), 0) - totalAmount) > 0.005)) {
    res.status(400).json({ error: "Split tender payments must be valid and equal the sale total" });
    return;
  }

  // Attribution is optional for legacy/single-store clients, but supplied IDs must belong together in this tenant.
  if (storeId || registerId || shiftId) {
    if (typeof storeId !== "string" || typeof registerId !== "string") {
      res.status(400).json({ error: "storeId and registerId are required together" });
      return;
    }
    const [[store], [register], shifts] = await Promise.all([
      db.select().from(storesTable).where(and(eq(storesTable.id, storeId), eq(storesTable.tenantId, tenantId))).limit(1),
      db.select().from(registersTable).where(and(eq(registersTable.id, registerId), eq(registersTable.tenantId, tenantId), eq(registersTable.storeId, storeId))).limit(1),
      typeof shiftId === "string"
        ? db.select().from(registerShiftsTable).where(and(eq(registerShiftsTable.id, shiftId), eq(registerShiftsTable.tenantId, tenantId), eq(registerShiftsTable.registerId, registerId), eq(registerShiftsTable.status, "open"))).limit(1)
        : Promise.resolve([]),
    ]);
    if (!store || !register || (shiftId && !shifts[0])) {
      res.status(400).json({ error: "Invalid store, register, or shift attribution" });
      return;
    }
  }

  const saleResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${idempotencyKey}))`);
    const [duplicate] = await tx.select().from(salesTable).where(and(
      eq(salesTable.tenantId, tenantId),
      eq(salesTable.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (duplicate) return { sale: duplicate, existing: true };

    if (typeof shiftId === "string") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${shiftId}))`);
      const [openShift] = await tx.select({ id: registerShiftsTable.id }).from(registerShiftsTable).where(and(
        eq(registerShiftsTable.id, shiftId), eq(registerShiftsTable.tenantId, tenantId), eq(registerShiftsTable.status, "open"),
      )).limit(1);
      if (!openShift) throw new Error("Register shift is no longer open");
    }
    const [created] = await tx.insert(salesTable).values({
      tenantId,
      receiptNumber: generateReceiptNumber(),
      customerId: typeof customerId === "string" && customerId ? customerId : undefined,
      cashierId,
      storeId: typeof storeId === "string" ? storeId : undefined,
      registerId: typeof registerId === "string" ? registerId : undefined,
      shiftId: typeof shiftId === "string" ? shiftId : undefined,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      discountAmount: String(discountAmount),
      totalAmount: String(totalAmount),
      paymentMethod: tenderInputs && tenderInputs.length > 1 ? "mixed" : paymentMethod,
      status: "completed",
      cashTendered: parsedCashTendered !== undefined ? String(parsedCashTendered) : undefined,
      note,
      idempotencyKey,
    }).returning();

    for (const item of validLineItems) {
      const [saleItem] = await tx.insert(saleItemsTable).values({
        saleId: created.id,
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        discount: String(item.discount),
        totalPrice: String(item.totalPrice),
        unitCostSnapshot: item.product.costPrice ?? null,
        categoryIdSnapshot: item.product.categoryId,
      }).returning();
      const stockUpdate = await tx.update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
        .where(and(eq(productsTable.id, item.product.id), eq(productsTable.tenantId, tenantId), gte(productsTable.stock, item.quantity)))
        .returning({ id: productsTable.id });
      if (!stockUpdate.length) throw new Error(`Insufficient stock for product ${item.product.id}`);
      await tx.insert(inventoryMovementsTable).values({
        tenantId, productId: item.product.id, adjustment: -item.quantity, reason: "sale",
        createdBy: cashierId, storeId: typeof storeId === "string" ? storeId : undefined,
        saleId: created.id, referenceType: "sale", referenceId: created.id,
      });
      if (item.discount > 0) {
        await tx.insert(saleDiscountsTable).values({
          tenantId, saleId: created.id, saleItemId: saleItem.id, amount: String(item.discount),
          appliedBy: cashierId, reason: "POS line discount",
        });
      }
    }

    const normalizedPayments = tenderInputs ?? [{
      method: paymentMethod, amount: totalAmount,
      tenderedAmount: parsedCashTendered, reference: undefined,
    }];
    for (const payment of normalizedPayments) {
      const amount = Number(payment.amount);
      await tx.insert(salePaymentsTable).values({
        tenantId, saleId: created.id, method: String(payment.method), amount: String(amount),
        tenderedAmount: payment.tenderedAmount == null ? undefined : String(payment.tenderedAmount),
        reference: typeof payment.reference === "string" ? payment.reference : undefined,
      });
      if (payment.method === "cash" && typeof storeId === "string" && typeof registerId === "string" && typeof shiftId === "string") {
        await tx.insert(cashEventsTable).values({
          tenantId, storeId, registerId, shiftId, saleId: created.id,
          type: "sale", amount: String(amount), createdBy: cashierId,
        });
      }
    }
    if (customer[0]) {
      await tx.update(customersTable).set({
        totalPurchases: String(parseFloat(customer[0].totalPurchases) + totalAmount),
        totalOrders: customer[0].totalOrders + 1,
        loyaltyPoints: customer[0].loyaltyPoints + Math.floor(totalAmount),
      }).where(and(eq(customersTable.id, customer[0].id), eq(customersTable.tenantId, tenantId)));
    }
    await tx.insert(auditEventsTable).values({
      tenantId, actorId: cashierId, storeId: typeof storeId === "string" ? storeId : undefined,
      action: "sale.completed", entityType: "sale", entityId: created.id,
      after: { receiptNumber: created.receiptNumber, totalAmount, paymentMethod: created.paymentMethod },
    });
    return { sale: created, existing: false };
  });

  const result = await buildSaleResponse(saleResult.sale);
  res.status(saleResult.existing ? 200 : 201).json(result);
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
  if (sale.status === "refunded") {
    res.status(409).json({ error: "Sale is already refunded" });
    return;
  }
  const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
  const updated = await db.transaction(async (tx) => {
    const [changed] = await tx.update(salesTable).set({ status: "refunded" })
      .where(and(eq(salesTable.id, id), eq(salesTable.tenantId, tenantId))).returning();
    const [refund] = await tx.insert(refundsTable).values({
      tenantId, saleId: sale.id, amount: sale.totalAmount, taxAmount: sale.taxAmount,
      method: sale.paymentMethod, reason, createdBy: req.user!.id, approvedBy: req.user!.id,
    }).returning();
    const items = await tx.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, sale.id));
    if (items.length) await tx.insert(refundItemsTable).values(items.map((item) => ({
      tenantId, refundId: refund.id, saleItemId: item.id, quantity: item.quantity,
      amount: item.totalPrice,
      costAmount: item.unitCostSnapshot == null ? null : String(Number(item.unitCostSnapshot) * item.quantity),
      restocked: false,
    })));
    if (sale.paymentMethod === "cash" && sale.storeId && sale.registerId && sale.shiftId) {
      await tx.insert(cashEventsTable).values({
        tenantId, storeId: sale.storeId, registerId: sale.registerId, shiftId: sale.shiftId,
        saleId: sale.id, type: "refund", amount: String(-Number(sale.totalAmount)),
        reason, createdBy: req.user!.id, approvedBy: req.user!.id,
      });
    }
    await tx.insert(auditEventsTable).values({
      tenantId, actorId: req.user!.id, storeId: sale.storeId, action: "sale.refunded",
      entityType: "sale", entityId: sale.id, reason,
      before: { status: sale.status }, after: { status: "refunded", refundId: refund.id },
    });
    return changed;
  });
  res.json(await buildSaleResponse(updated));
});

export default router;
