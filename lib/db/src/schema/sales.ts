import { pgTable, text, timestamp, uuid, numeric, integer } from "drizzle-orm/pg-core";

export const salesTable = pgTable("sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  customerId: uuid("customer_id"),
  cashierId: uuid("cashier_id").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"), // cash, card, bank_transfer, store_credit, gift_card, mixed
  status: text("status").notNull().default("completed"), // completed, refunded, partial_refund, voided
  cashTendered: numeric("cash_tendered", { precision: 10, scale: 2 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleItemsTable = pgTable("sale_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  adjustment: integer("adjustment").notNull(),
  reason: text("reason").notNull(), // purchase, damage, theft, correction, return, transfer
  note: text("note"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Sale = typeof salesTable.$inferSelect;
export type InsertSale = typeof salesTable.$inferInsert;
export type SaleItem = typeof saleItemsTable.$inferSelect;
export type InsertSaleItem = typeof saleItemsTable.$inferInsert;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type InsertInventoryMovement = typeof inventoryMovementsTable.$inferInsert;
