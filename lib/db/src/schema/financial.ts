import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const salePaymentsTable = pgTable("sale_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  saleId: uuid("sale_id").notNull(),
  method: text("method").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  tenderedAmount: numeric("tendered_amount", { precision: 14, scale: 2 }),
  reference: text("reference"),
  status: text("status").notNull().default("captured"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sale_payments_tenant_created_idx").on(table.tenantId, table.createdAt),
  index("sale_payments_sale_idx").on(table.saleId),
]);

export const saleDiscountsTable = pgTable("sale_discounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  saleId: uuid("sale_id").notNull(),
  saleItemId: uuid("sale_item_id"),
  type: text("type").notNull().default("amount"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason"),
  appliedBy: uuid("applied_by").notNull(),
  approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sale_discounts_tenant_created_idx").on(table.tenantId, table.createdAt)]);

export const refundsTable = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  saleId: uuid("sale_id").notNull(),
  paymentId: uuid("payment_id"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  method: text("method").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("completed"),
  createdBy: uuid("created_by").notNull(),
  approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("refunds_tenant_created_idx").on(table.tenantId, table.createdAt),
  index("refunds_sale_idx").on(table.saleId),
]);

export const refundItemsTable = pgTable("refund_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  refundId: uuid("refund_id").notNull(),
  saleItemId: uuid("sale_item_id").notNull(),
  quantity: integer("quantity").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  costAmount: numeric("cost_amount", { precision: 14, scale: 2 }),
  restocked: boolean("restocked").notNull().default(false),
});

export const saleVoidsTable = pgTable("sale_voids", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  saleId: uuid("sale_id").notNull(),
  reason: text("reason").notNull(),
  voidedBy: uuid("voided_by").notNull(),
  approvedBy: uuid("approved_by"),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sale_voids_tenant_created_idx").on(table.tenantId, table.createdAt)]);
