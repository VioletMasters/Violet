import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const licensesTable = pgTable("licenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique(),
  planId: uuid("plan_id").notNull(),
  licenseKeyHash: text("license_key_hash").notNull().unique(),
  licenseKeyLast4: text("license_key_last4").notNull(),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE, SUSPENDED, EXPIRED, REVOKED, TRIAL, PENDING
  subscriptionStatus: text("subscription_status").notNull().default("active"),
  version: text("version").notNull().default("1"),
  entitlements: jsonb("entitlements").$type<Record<string, unknown>>().notNull().default({}),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("licenses_tenant_idx").on(table.tenantId),
  index("licenses_status_idx").on(table.status),
]);

export type License = typeof licensesTable.$inferSelect;
export type InsertLicense = typeof licensesTable.$inferInsert;