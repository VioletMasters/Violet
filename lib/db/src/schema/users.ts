import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull().default("employee"), // owner, administrator, manager, cashier, inventory_staff, accountant, employee, super_admin
  avatarUrl: text("avatar_url"),
  isActive: text("is_active").notNull().default("true"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }).defaultNow(),
  emailVerificationTokenHash: text("email_verification_token_hash"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  passwordResetTokenHashIdx: uniqueIndex("users_password_reset_token_hash_idx")
    .on(table.passwordResetTokenHash),
  emailVerificationTokenHashIdx: uniqueIndex("users_email_verification_token_hash_idx")
    .on(table.emailVerificationTokenHash),
}));

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
