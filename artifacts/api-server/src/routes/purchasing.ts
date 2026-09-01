import { Router } from "express";
import {
  auditEventsTable, db, inventoryMovementsTable, productsTable, purchaseOrderItemsTable,
  purchaseOrdersTable, receiptItemsTable, receiptsTable, storesTable, suppliersTable,
  receivingDiscrepanciesTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireManagerAccess } from "../middlewares/auth";

const router = Router();
const allowedTransitions: Record<string, Set<string>> = {
  draft: new Set(["ordered", "cancelled"]),
  ordered: new Set(["cancelled"]),
  partially_received: new Set(["cancelled"]),
};

function orderNumber(): string {
  return `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

router.get("/purchase-orders", requireManagerAccess, async (req, res): Promise<void> => {
  const conditions = [eq(purchaseOrdersTable.tenantId, req.tenantId!)];
  if (typeof req.query.storeId === "string") conditions.push(eq(purchaseOrdersTable.storeId, req.query.storeId));
  if (typeof req.query.supplierId === "string") conditions.push(eq(purchaseOrdersTable.supplierId, req.query.supplierId));
  if (typeof req.query.status === "string") conditions.push(eq(purchaseOrdersTable.status, req.query.status));
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const [data, count] = await Promise.all([
    db.select().from(purchaseOrdersTable).where(and(...conditions)).orderBy(desc(purchaseOrdersTable.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`COUNT(*)` }).from(purchaseOrdersTable).where(and(...conditions)),
  ]);
  res.json({ data, total: Number(count[0]?.total ?? 0), page, limit });
});

router.post("/purchase-orders", requireManagerAccess, async (req, res): Promise<void> => {
  const { supplierId, storeId, expectedAt } = req.body ?? {};
  const idempotencyKey = req.header("idempotency-key") ?? undefined;
  if (idempotencyKey) {
    const [existing] = await db.select().from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.tenantId, req.tenantId!), eq(purchaseOrdersTable.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (existing) { res.json(existing); return; }
  }
  const lines = req.body?.items as Array<{ productId?: unknown; quantity?: unknown; unitCost?: unknown; taxAmount?: unknown }> | undefined;
  if (typeof supplierId !== "string" || !Array.isArray(lines) || !lines.length || lines.some((line) =>
    typeof line.productId !== "string" || !Number.isInteger(line.quantity) || Number(line.quantity) <= 0 ||
    !Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0 ||
    (line.taxAmount != null && (!Number.isFinite(Number(line.taxAmount)) || Number(line.taxAmount) < 0))
  )) {
    res.status(400).json({ error: "supplierId and valid purchase-order items are required" }); return;
  }
  if (expectedAt && !Number.isFinite(new Date(expectedAt).valueOf())) {
    res.status(400).json({ error: "expectedAt must be a valid date" }); return;
  }
  const productIds = lines.map((line) => String(line.productId));
  if (new Set(productIds).size !== productIds.length) { res.status(400).json({ error: "Products may only appear once" }); return; }
  const [[supplier], stores, products] = await Promise.all([
    db.select().from(suppliersTable).where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.tenantId, req.tenantId!))).limit(1),
    typeof storeId === "string" ? db.select().from(storesTable).where(and(eq(storesTable.id, storeId), eq(storesTable.tenantId, req.tenantId!))).limit(1) : Promise.resolve([]),
    db.select().from(productsTable).where(and(eq(productsTable.tenantId, req.tenantId!), inArray(productsTable.id, productIds))),
  ]);
  if (!supplier || (storeId && !stores[0]) || products.length !== productIds.length) {
    res.status(400).json({ error: "Supplier, store, or product is unavailable for this tenant" }); return;
  }
  const subtotal = lines.reduce((n, line) => n + Number(line.quantity) * Number(line.unitCost), 0);
  const tax = lines.reduce((n, line) => n + Number(line.taxAmount ?? 0), 0);
  const created = await db.transaction(async (tx) => {
    if (idempotencyKey) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const [duplicate] = await tx.select().from(purchaseOrdersTable).where(and(
        eq(purchaseOrdersTable.tenantId, req.tenantId!), eq(purchaseOrdersTable.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (duplicate) return { purchaseOrder: duplicate, existing: true };
    }
    const [purchaseOrder] = await tx.insert(purchaseOrdersTable).values({
      tenantId: req.tenantId!, supplierId, storeId: typeof storeId === "string" ? storeId : undefined,
      orderNumber: typeof req.body.orderNumber === "string" && req.body.orderNumber.trim() ? req.body.orderNumber.trim() : orderNumber(),
      subtotal: String(subtotal), taxAmount: String(tax), totalAmount: String(subtotal + tax),
      expectedAt: expectedAt ? new Date(expectedAt) : undefined, createdBy: req.user!.id, idempotencyKey,
    }).returning();
    await tx.insert(purchaseOrderItemsTable).values(lines.map((line) => ({
      tenantId: req.tenantId!, purchaseOrderId: purchaseOrder.id, productId: String(line.productId),
      quantityOrdered: Number(line.quantity), unitCost: String(line.unitCost), taxAmount: String(line.taxAmount ?? 0),
    })));
    await tx.insert(auditEventsTable).values({
      tenantId: req.tenantId!, actorId: req.user!.id, storeId: purchaseOrder.storeId,
      action: "purchase_order.created", entityType: "purchase_order", entityId: purchaseOrder.id,
      after: { orderNumber: purchaseOrder.orderNumber, supplierId, totalAmount: subtotal + tax, itemCount: lines.length },
    });
    return { purchaseOrder, existing: false };
  });
  res.status(created.existing ? 200 : 201).json(created.purchaseOrder);
});

router.get("/purchase-orders/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [purchaseOrder] = await db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, req.tenantId!))).limit(1);
  if (!purchaseOrder) { res.status(404).json({ error: "Purchase order not found" }); return; }
  const [items, receipts] = await Promise.all([
    db.select().from(purchaseOrderItemsTable).where(and(eq(purchaseOrderItemsTable.purchaseOrderId, id), eq(purchaseOrderItemsTable.tenantId, req.tenantId!))),
    db.select().from(receiptsTable).where(and(eq(receiptsTable.purchaseOrderId, id), eq(receiptsTable.tenantId, req.tenantId!))).orderBy(desc(receiptsTable.receivedAt)),
  ]);
  const receiptIds = receipts.map((receipt) => receipt.id);
  const receivedItems = receiptIds.length
    ? await db.select().from(receiptItemsTable).where(and(eq(receiptItemsTable.tenantId, req.tenantId!), inArray(receiptItemsTable.receiptId, receiptIds)))
    : [];
  const discrepancies = receiptIds.length
    ? await db.select().from(receivingDiscrepanciesTable).where(and(eq(receivingDiscrepanciesTable.tenantId, req.tenantId!), inArray(receivingDiscrepanciesTable.receiptId, receiptIds)))
    : [];
  res.json({ ...purchaseOrder, items, receipts: receipts.map((receipt) => ({
    ...receipt,
    items: receivedItems.filter((item) => item.receiptId === receipt.id),
    discrepancies: discrepancies.filter((item) => item.receiptId === receipt.id),
  })) });
});

router.patch("/purchase-orders/:id/status", requireManagerAccess, async (req, res): Promise<void> => {
  const id = String(req.params.id); const status = req.body?.status;
  if (typeof status !== "string") { res.status(400).json({ error: "status is required" }); return; }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    const [current] = await tx.select().from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, req.tenantId!))).limit(1);
    if (!current) return { kind: "missing" as const };
    if (current.status === status) return { kind: "same" as const, purchaseOrder: current };
    if (!allowedTransitions[current.status]?.has(status)) return { kind: "invalid" as const, current: current.status };
    const [updated] = await tx.update(purchaseOrdersTable).set({
      status, orderedAt: status === "ordered" ? new Date() : current.orderedAt,
    }).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, req.tenantId!))).returning();
    await tx.insert(auditEventsTable).values({
      tenantId: req.tenantId!, actorId: req.user!.id, storeId: current.storeId,
      action: "purchase_order.status_changed", entityType: "purchase_order", entityId: id,
      before: { status: current.status }, after: { status },
    });
    return { kind: "updated" as const, purchaseOrder: updated };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (result.kind === "invalid") { res.status(409).json({ error: `Cannot transition purchase order from ${result.current} to ${status}` }); return; }
  res.json(result.purchaseOrder);
});

router.post("/purchase-orders/:id/receipts", requireManagerAccess, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const finalize = req.body?.finalize === true;
  const lines = req.body?.items as Array<{ purchaseOrderItemId?: unknown; quantityReceived?: unknown; unitCost?: unknown; discrepancyReason?: unknown }> | undefined;
  if (!Array.isArray(lines) || !lines.length || lines.some((line) =>
    typeof line.purchaseOrderItemId !== "string" || !Number.isInteger(line.quantityReceived) || Number(line.quantityReceived) < 0 ||
    (!finalize && Number(line.quantityReceived) === 0) ||
    !Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0
  )) { res.status(400).json({ error: "Valid receipt items are required" }); return; }
  const lineIds = lines.map((line) => String(line.purchaseOrderItemId));
  if (new Set(lineIds).size !== lineIds.length) { res.status(400).json({ error: "Purchase-order lines may only appear once" }); return; }
  const idempotencyKey = req.header("idempotency-key") ?? undefined;
  if (idempotencyKey) {
    const [existing] = await db.select().from(receiptsTable).where(and(eq(receiptsTable.tenantId, req.tenantId!), eq(receiptsTable.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) {
      if (existing.purchaseOrderId !== id) { res.status(409).json({ error: "Idempotency key was already used for another purchase order" }); return; }
      res.json(existing); return;
    }
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    if (idempotencyKey) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const [duplicate] = await tx.select().from(receiptsTable).where(and(
        eq(receiptsTable.tenantId, req.tenantId!), eq(receiptsTable.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (duplicate) return duplicate.purchaseOrderId === id
        ? { kind: "existing" as const, receipt: duplicate }
        : { kind: "idempotency_conflict" as const };
    }
    const [purchaseOrder] = await tx.select().from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, req.tenantId!))).limit(1);
    if (!purchaseOrder) return { kind: "missing" as const };
    if (!["ordered", "partially_received"].includes(purchaseOrder.status)) return { kind: "status" as const };
    const orderItems = await tx.select().from(purchaseOrderItemsTable).where(and(
      eq(purchaseOrderItemsTable.tenantId, req.tenantId!), eq(purchaseOrderItemsTable.purchaseOrderId, id),
    ));
    const byId = new Map(orderItems.map((item) => [item.id, item]));
    if (lineIds.some((lineId) => !byId.has(lineId))) return { kind: "lines" as const };
    const previous = await tx.select({
      lineId: receiptItemsTable.purchaseOrderItemId, quantity: sql<number>`COALESCE(SUM(${receiptItemsTable.quantityReceived}), 0)`,
    }).from(receiptItemsTable).innerJoin(receiptsTable, eq(receiptItemsTable.receiptId, receiptsTable.id))
      .where(and(eq(receiptsTable.tenantId, req.tenantId!), eq(receiptsTable.purchaseOrderId, id)))
      .groupBy(receiptItemsTable.purchaseOrderItemId);
    const received = new Map(previous.map((row) => [row.lineId, Number(row.quantity)]));
    const outstanding = orderItems.filter((item) => (received.get(item.id) ?? 0) < item.quantityOrdered);
    if (finalize && outstanding.some((item) => !lineIds.includes(item.id))) return { kind: "finalize_lines" as const };
    for (const line of lines) {
      const ordered = byId.get(String(line.purchaseOrderItemId))!;
      const remaining = ordered.quantityOrdered - (received.get(ordered.id) ?? 0);
      const discrepancy = Number(line.quantityReceived) > remaining ||
        (finalize && Number(line.quantityReceived) !== remaining) ||
        (Number(line.quantityReceived) > 0 && Math.abs(Number(line.unitCost) - Number(ordered.unitCost)) > 0.00005);
      if (discrepancy && (typeof line.discrepancyReason !== "string" || !line.discrepancyReason.trim())) return { kind: "discrepancy" as const };
    }
    const [receipt] = await tx.insert(receiptsTable).values({
      tenantId: req.tenantId!, purchaseOrderId: id, storeId: purchaseOrder.storeId,
      reference: typeof req.body.reference === "string" ? req.body.reference : undefined,
      receivedBy: req.user!.id, idempotencyKey,
    }).returning();
    await tx.insert(receiptItemsTable).values(lines.map((line) => {
      const ordered = byId.get(String(line.purchaseOrderItemId))!;
      return {
        tenantId: req.tenantId!, receiptId: receipt.id, purchaseOrderItemId: ordered.id, productId: ordered.productId,
        quantityReceived: Number(line.quantityReceived), unitCost: String(line.unitCost),
        discrepancyReason: typeof line.discrepancyReason === "string" ? line.discrepancyReason.trim() || undefined : undefined,
      };
    }));
    const discrepancyRows = lines.flatMap((line) => {
      const ordered = byId.get(String(line.purchaseOrderItemId))!;
      const remaining = ordered.quantityOrdered - (received.get(ordered.id) ?? 0);
      const quantity = Number(line.quantityReceived); const unitCost = Number(line.unitCost);
      const reason = typeof line.discrepancyReason === "string" ? line.discrepancyReason.trim() : "";
      const rows: Array<typeof receivingDiscrepanciesTable.$inferInsert> = [];
      if (quantity > remaining || (finalize && quantity !== remaining)) rows.push({
        tenantId: req.tenantId!, receiptId: receipt.id, purchaseOrderItemId: ordered.id,
        type: quantity > remaining ? "overage" : "shortage", expectedQuantity: remaining, receivedQuantity: quantity,
        expectedUnitCost: ordered.unitCost, receivedUnitCost: String(unitCost), reason,
      });
      if (quantity > 0 && Math.abs(unitCost - Number(ordered.unitCost)) > 0.00005) rows.push({
        tenantId: req.tenantId!, receiptId: receipt.id, purchaseOrderItemId: ordered.id,
        type: "unit_cost", expectedQuantity: remaining, receivedQuantity: quantity,
        expectedUnitCost: ordered.unitCost, receivedUnitCost: String(unitCost), reason,
      });
      return rows;
    });
    if (discrepancyRows.length) await tx.insert(receivingDiscrepanciesTable).values(discrepancyRows);
    for (const line of lines) {
      const ordered = byId.get(String(line.purchaseOrderItemId))!; const quantity = Number(line.quantityReceived); const unitCost = Number(line.unitCost);
      if (quantity === 0) continue;
      const productUpdate = await tx.update(productsTable).set({
        costPrice: sql`CASE WHEN ${productsTable.stock} + ${quantity} > 0 THEN ((COALESCE(${productsTable.costPrice}, 0)::numeric * ${productsTable.stock}) + ${unitCost} * ${quantity}) / (${productsTable.stock} + ${quantity}) ELSE ${unitCost} END`,
        stock: sql`${productsTable.stock} + ${quantity}`,
      }).where(and(eq(productsTable.id, ordered.productId), eq(productsTable.tenantId, req.tenantId!)))
        .returning({ id: productsTable.id });
      if (!productUpdate.length) throw new Error(`Product ${ordered.productId} is no longer available`);
      await tx.insert(inventoryMovementsTable).values({
        tenantId: req.tenantId!, productId: ordered.productId, adjustment: quantity, reason: "purchase_receipt",
        note: typeof line.discrepancyReason === "string" ? line.discrepancyReason : undefined,
        createdBy: req.user!.id, storeId: purchaseOrder.storeId, purchaseReceiptId: receipt.id,
        referenceType: "purchase_receipt", referenceId: receipt.id,
      });
      received.set(ordered.id, (received.get(ordered.id) ?? 0) + quantity);
    }
    const complete = finalize || orderItems.every((item) => (received.get(item.id) ?? 0) >= item.quantityOrdered);
    const nextStatus = complete ? "received" : "partially_received";
    await tx.update(purchaseOrdersTable).set({ status: nextStatus }).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, req.tenantId!)));
    await tx.insert(auditEventsTable).values({
      tenantId: req.tenantId!, actorId: req.user!.id, storeId: purchaseOrder.storeId,
      action: "purchase_order.received", entityType: "purchase_receipt", entityId: receipt.id,
      before: { purchaseOrderStatus: purchaseOrder.status }, after: { purchaseOrderStatus: nextStatus, itemCount: lines.length },
    });
    return { kind: "created" as const, receipt, purchaseOrderStatus: nextStatus };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (result.kind === "status") { res.status(409).json({ error: "Only ordered purchase orders can be received" }); return; }
  if (result.kind === "lines") { res.status(400).json({ error: "A receipt line does not belong to this purchase order" }); return; }
  if (result.kind === "finalize_lines") { res.status(400).json({ error: "Final receipts must include every outstanding line, including zero-quantity shortages" }); return; }
  if (result.kind === "discrepancy") { res.status(400).json({ error: "Over-receipts and unit-cost discrepancies require a reason" }); return; }
  if (result.kind === "idempotency_conflict") { res.status(409).json({ error: "Idempotency key was already used for another purchase order" }); return; }
  if (result.kind === "existing") { res.json(result.receipt); return; }
  res.status(201).json({ ...result.receipt, purchaseOrderStatus: result.purchaseOrderStatus });
});

export default router;