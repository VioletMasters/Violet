import { index, pgTable, text, timestamp, uuid, numeric, integer, boolean } from "drizzle-orm/pg-core";

export const plansTable = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tier: text("tier").notNull(), // free, starter, professional, enterprise, lifetime
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  annualPrice: numeric("annual_price", { precision: 10, scale: 2 }),
  billingType: text("billing_type").notNull().default("one_time"), // one_time, monthly, annual, enterprise
  currency: text("currency").notNull().default("USD"),
  checkoutPrice: numeric("checkout_price", { precision: 10, scale: 2 }).notNull().default("0"),
  checkoutCurrency: text("checkout_currency").notNull().default("USD"),
  whopPlanId: text("whop_plan_id"),
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
  whopPlanId: text("whop_plan_id"),
  whopCheckoutConfigurationId: text("whop_checkout_configuration_id"),
  pendingWhopCheckoutConfigurationId: text("pending_whop_checkout_configuration_id"),
  pendingWhopTier: text("pending_whop_tier"),
  pendingWhopClaim: text("pending_whop_claim"),
  pendingWhopUserId: uuid("pending_whop_user_id"),
  whopMembershipId: text("whop_membership_id"),
  lastWhopSyncAt: timestamp("last_whop_sync_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const subscriptionEventsTable = pgTable("subscription_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  subscriptionId: uuid("subscription_id"),
  eventType: text("event_type").notNull(), // activated, plan_changed, cancellation_requested, cancelled, reactivated, admin_override
  fromPlanId: uuid("from_plan_id"),
  toPlanId: uuid("to_plan_id"),
  source: text("source").notNull().default("system"), // whop, admin, customer, system
  reason: text("reason"),
  whopMembershipId: text("whop_membership_id"),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("subscription_events_tenant_created_idx").on(table.tenantId, table.createdAt),
  index("subscription_events_tenant_effective_idx").on(table.tenantId, table.effectiveAt),
]);

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = typeof subscriptionsTable.$inferInsert;
export type SubscriptionEvent = typeof subscriptionEventsTable.$inferSelect;
export type InsertSubscriptionEvent = typeof subscriptionEventsTable.$inferInsert;
