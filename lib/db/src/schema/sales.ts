import { index, pgTable, text, timestamp, uuid, numeric, integer } from "drizzle-orm/pg-core";

export const salesTable = pgTable("sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  customerId: uuid("customer_id"),
  cashierId: uuid("cashier_id").notNull(),
  storeId: uuid("store_id"),
  registerId: uuid("register_id"),
  shiftId: uuid("shift_id"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"), // cash, card, bank_transfer, store_credit, gift_card, mixed
  status: text("status").notNull().default("completed"), // completed, refunded, partial_refund, voided
  cashTendered: numeric("cash_tendered", { precision: 10, scale: 2 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sales_tenant_created_idx").on(table.tenantId, table.createdAt),
  index("sales_tenant_store_created_idx").on(table.tenantId, table.storeId, table.createdAt),
  index("sales_tenant_cashier_created_idx").on(table.tenantId, table.cashierId, table.createdAt),
]);

export const saleItemsTable = pgTable("sale_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  unitCostSnapshot: numeric("unit_cost_snapshot", { precision: 14, scale: 4 }),
  categoryIdSnapshot: uuid("category_id_snapshot"),
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  adjustment: integer("adjustment").notNull(),
  reason: text("reason").notNull(), // purchase, damage, theft, correction, return, transfer
  note: text("note"),
  createdBy: uuid("created_by").notNull(),
  storeId: uuid("store_id"),
  saleId: uuid("sale_id"),
  purchaseReceiptId: uuid("purchase_receipt_id"),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("inventory_movements_tenant_created_idx").on(table.tenantId, table.createdAt)]);

export type Sale = typeof salesTable.$inferSelect;
export type InsertSale = typeof salesTable.$inferInsert;
export type SaleItem = typeof saleItemsTable.$inferSelect;
export type InsertSaleItem = typeof saleItemsTable.$inferInsert;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type InsertInventoryMovement = typeof inventoryMovementsTable.$inferInsert;
