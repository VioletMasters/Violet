import { index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const supplierProductsTable = pgTable("supplier_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  productId: uuid("product_id").notNull(),
  supplierSku: text("supplier_sku"),
  lastUnitCost: numeric("last_unit_cost", { precision: 14, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("supplier_products_tenant_pair_uidx").on(table.tenantId, table.supplierId, table.productId)]);

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  storeId: uuid("store_id"),
  supplierId: uuid("supplier_id").notNull(),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  expectedAt: timestamp("expected_at", { withTimezone: true }),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("purchase_orders_tenant_number_uidx").on(table.tenantId, table.orderNumber),
  uniqueIndex("purchase_orders_tenant_idempotency_uidx").on(table.tenantId, table.idempotencyKey),
  index("purchase_orders_tenant_created_idx").on(table.tenantId, table.createdAt),
]);

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  purchaseOrderId: uuid("purchase_order_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantityOrdered: integer("quantity_ordered").notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
});

export const receiptsTable = pgTable("purchase_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  purchaseOrderId: uuid("purchase_order_id").notNull(),
  storeId: uuid("store_id"),
  reference: text("reference"),
  receivedBy: uuid("received_by").notNull(),
  idempotencyKey: text("idempotency_key"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("purchase_receipts_tenant_received_idx").on(table.tenantId, table.receivedAt),
  uniqueIndex("purchase_receipts_tenant_idempotency_uidx").on(table.tenantId, table.idempotencyKey),
]);

export const receiptItemsTable = pgTable("purchase_receipt_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  receiptId: uuid("receipt_id").notNull(),
  purchaseOrderItemId: uuid("purchase_order_item_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantityReceived: integer("quantity_received").notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull(),
  discrepancyReason: text("discrepancy_reason"),
});

export const receivingDiscrepanciesTable = pgTable("receiving_discrepancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  receiptId: uuid("receipt_id").notNull(),
  purchaseOrderItemId: uuid("purchase_order_item_id").notNull(),
  type: text("type").notNull(), // shortage, overage, unit_cost
  expectedQuantity: integer("expected_quantity").notNull(),
  receivedQuantity: integer("received_quantity").notNull(),
  expectedUnitCost: numeric("expected_unit_cost", { precision: 14, scale: 4 }).notNull(),
  receivedUnitCost: numeric("received_unit_cost", { precision: 14, scale: 4 }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("receiving_discrepancies_tenant_receipt_idx").on(table.tenantId, table.receiptId)]);
