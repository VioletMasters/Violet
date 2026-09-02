import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const licenseSessionsTable = pgTable("license_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id").notNull(),
  installationId: text("installation_id").notNull(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("license_sessions_tenant_idx").on(table.tenantId),
  index("license_sessions_expires_idx").on(table.expiresAt),
]);

export type LicenseSession = typeof licenseSessionsTable.$inferSelect;
export type InsertLicenseSession = typeof licenseSessionsTable.$inferInsert;