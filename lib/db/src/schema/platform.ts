import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";

export const releasesTable = pgTable("platform_releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  channel: text("channel").notNull().default("stable"), // stable, beta, nightly
  releaseNotes: text("release_notes"),
  status: text("status").notNull().default("draft"), // draft, published, archived
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const releaseAssetsTable = pgTable("platform_release_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseId: uuid("release_id").notNull(),
  platform: text("platform").notNull(), // windows, macos, linux, docker
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformAuditLogsTable = pgTable("platform_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformRelease = typeof releasesTable.$inferSelect;
export type InsertPlatformRelease = typeof releasesTable.$inferInsert;
export type ReleaseAsset = typeof releaseAssetsTable.$inferSelect;
export type InsertReleaseAsset = typeof releaseAssetsTable.$inferInsert;
export type PlatformAuditLog = typeof platformAuditLogsTable.$inferSelect;
export type InsertPlatformAuditLog = typeof platformAuditLogsTable.$inferInsert;