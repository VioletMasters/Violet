import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const printersTable = pgTable("printers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  storeId: uuid("store_id"),
  registerId: uuid("register_id"),
  name: text("name").notNull(),
  role: text("role").notNull().default("customer_receipt"),
  connectionType: text("connection_type").notNull().default("os"),
  deviceName: text("device_name").notNull(),
  deviceAddress: text("device_address"),
  platform: text("platform"),
  isActive: integer("is_active").notNull().default(1),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("printers_tenant_scope_idx").on(table.tenantId, table.storeId, table.registerId),
  index("printers_tenant_role_idx").on(table.tenantId, table.role),
]);

export const printJobsTable = pgTable("print_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  saleId: uuid("sale_id"),
  storeId: uuid("store_id"),
  registerId: uuid("register_id"),
  printerId: uuid("printer_id"),
  documentType: text("document_type").notNull(),
  status: text("status").notNull().default("queued"),
  payload: text("payload").notNull(),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("print_jobs_tenant_created_idx").on(table.tenantId, table.createdAt),
  index("print_jobs_tenant_sale_idx").on(table.tenantId, table.saleId),
  uniqueIndex("print_jobs_tenant_idempotency_uidx").on(table.tenantId, table.idempotencyKey),
]);

export const warehouseTicketsTable = pgTable("warehouse_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  saleId: uuid("sale_id").notNull(),
  storeId: uuid("store_id"),
  registerId: uuid("register_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("warehouse_tickets_tenant_sale_uidx").on(table.tenantId, table.saleId),
  index("warehouse_tickets_tenant_status_idx").on(table.tenantId, table.status),
]);

export type Printer = typeof printersTable.$inferSelect;
export type InsertPrinter = typeof printersTable.$inferInsert;
export type PrintJob = typeof printJobsTable.$inferSelect;
export type InsertPrintJob = typeof printJobsTable.$inferInsert;
export type WarehouseTicket = typeof warehouseTicketsTable.$inferSelect;
export type InsertWarehouseTicket = typeof warehouseTicketsTable.$inferInsert;