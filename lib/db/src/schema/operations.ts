import { boolean, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const storesTable = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  timezone: text("timezone").notNull().default("UTC"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("stores_tenant_code_uidx").on(table.tenantId, table.code),
]);

export const registersTable = pgTable("registers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  storeId: uuid("store_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("registers_tenant_store_code_uidx").on(table.tenantId, table.storeId, table.code),
]);

export const registerShiftsTable = pgTable("register_shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  storeId: uuid("store_id").notNull(),
  registerId: uuid("register_id").notNull(),
  cashierId: uuid("cashier_id").notNull(),
  openedBy: uuid("opened_by").notNull(),
  closedBy: uuid("closed_by"),
  status: text("status").notNull().default("open"),
  openingCash: numeric("opening_cash", { precision: 14, scale: 2 }).notNull().default("0"),
  expectedCash: numeric("expected_cash", { precision: 14, scale: 2 }),
  closingCash: numeric("closing_cash", { precision: 14, scale: 2 }),
  variance: numeric("variance", { precision: 14, scale: 2 }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => [
  index("register_shifts_tenant_opened_idx").on(table.tenantId, table.openedAt),
  index("register_shifts_tenant_register_idx").on(table.tenantId, table.registerId),
]);

export const cashEventsTable = pgTable("cash_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  storeId: uuid("store_id").notNull(),
  registerId: uuid("register_id").notNull(),
  shiftId: uuid("shift_id").notNull(),
  saleId: uuid("sale_id"),
  type: text("type").notNull(), // opening, sale, refund, drop, payout, adjustment, closing
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason"),
  createdBy: uuid("created_by").notNull(),
  approvedBy: uuid("approved_by"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cash_events_tenant_created_idx").on(table.tenantId, table.createdAt),
  index("cash_events_tenant_shift_idx").on(table.tenantId, table.shiftId),
  uniqueIndex("cash_events_tenant_idempotency_uidx").on(table.tenantId, table.idempotencyKey),
]);
