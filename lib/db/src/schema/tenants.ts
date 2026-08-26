import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tenantsTable = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("active"), // active, suspended, trial, expired
  planId: uuid("plan_id"),
  licenseStatus: text("license_status").notNull().default("valid"), // valid, expired, revoked
  licenseValidatedAt: timestamp("license_validated_at", { withTimezone: true }).notNull().defaultNow(),
  licenseValidUntil: timestamp("license_valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Tenant = typeof tenantsTable.$inferSelect;
export type InsertTenant = typeof tenantsTable.$inferInsert;
