import { pgTable, text, timestamp, uuid, numeric, integer } from "drizzle-orm/pg-core";

export const customersTable = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  storeCredit: numeric("store_credit", { precision: 10, scale: 2 }).notNull().default("0"),
  totalPurchases: numeric("total_purchases", { precision: 10, scale: 2 }).notNull().default("0"),
  totalOrders: integer("total_orders").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
