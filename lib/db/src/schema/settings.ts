import { pgTable, text, timestamp, uuid, numeric, boolean } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique(),
  businessName: text("business_name").notNull(),
  businessEmail: text("business_email").notNull(),
  businessPhone: text("business_phone"),
  address: text("address"),
  currency: text("currency").notNull().default("JMD"),
  currencySymbol: text("currency_symbol").notNull().default("J$"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxName: text("tax_name").notNull().default("Tax"),
  receiptFooter: text("receipt_footer"),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("America/New_York"),
  requireManagerPasswordForCartRemoval: boolean("require_manager_password_for_cart_removal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Settings = typeof settingsTable.$inferSelect;
export type InsertSettings = typeof settingsTable.$inferInsert;
