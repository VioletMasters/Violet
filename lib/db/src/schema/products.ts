import { pgTable, text, timestamp, uuid, numeric, integer, boolean } from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const productsTable = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  categoryId: uuid("category_id"),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku").notNull(),
  barcode: text("barcode"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(5),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Category = typeof categoriesTable.$inferSelect;
export type InsertCategory = typeof categoriesTable.$inferInsert;
export type Product = typeof productsTable.$inferSelect;
export type InsertProduct = typeof productsTable.$inferInsert;
