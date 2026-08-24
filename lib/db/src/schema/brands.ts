import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const brandsTable = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InsertBrand = typeof brandsTable.$inferInsert;
export type Brand = typeof brandsTable.$inferSelect;