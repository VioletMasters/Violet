import { pgTable, text, timestamp, uuid, numeric, integer, boolean } from "drizzle-orm/pg-core";

export const plansTable = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tier: text("tier").notNull(), // free, starter, professional, enterprise, lifetime
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  annualPrice: numeric("annual_price", { precision: 10, scale: 2 }),
  billingType: text("billing_type").notNull().default("one_time"), // one_time, monthly, annual, enterprise
  maxUsers: integer("max_users").notNull().default(2),
  maxRegisters: integer("max_registers").notNull().default(1),
  maxBranches: integer("max_branches").notNull().default(1),
  maxProducts: integer("max_products").notNull().default(500),
  maxCustomers: integer("max_customers").notNull().default(500),
  features: text("features").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  isPopular: boolean("is_popular").notNull().default(false),
  trialDays: integer("trial_days").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique(),
  planId: uuid("plan_id").notNull(),
  status: text("status").notNull().default("active"), // active, trial, expired, cancelled
  paymentStatus: text("payment_status").notNull().default("not_required"), // not_required, pending, paid, past_due, failed
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = typeof subscriptionsTable.$inferInsert;
