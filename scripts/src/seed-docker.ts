#!/usr/bin/env node
/**
 * Docker seed script — runs on first boot inside the container.
 * Idempotent: safe to run multiple times.
 *
 * Required env vars:
 *   DATABASE_URL  — Postgres connection string
 *   ADMIN_EMAIL   — Super-admin email address
 *   ADMIN_PASSWORD — Super-admin password (plain text, will be hashed)
 */

import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import pg from "pg";

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}
if (!ADMIN_EMAIL) {
  console.error("ERROR: ADMIN_EMAIL is required");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("ERROR: ADMIN_PASSWORD is required");
  process.exit(1);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();
  console.log("🌱  Seeding database...");

  // ── 1. Subscription plans ──────────────────────────────────────────────
  await client.query(`
    INSERT INTO subscription_plans
      (name, tier, description, price, annual_price, billing_type, currency, checkout_price, checkout_currency,
       max_users, max_registers, max_branches, max_products, max_customers,
       features, is_active, is_popular, trial_days)
    VALUES
      ('Free', 'free',
       'Buy once, own forever. Perfect for a single small store with no monthly fees.',
       '0', NULL, 'one_time', 'JMD', '0', 'USD',
       2, 1, 1, 250, 500,
       ARRAY[
         'Basic POS (cash & card)',
         'Basic inventory management',
         'Daily sales summary',
         'Up to 250 products',
         'Up to 500 customers',
         '2 user accounts',
         'Violet branding'
       ],
       true, false, 0),

      ('Starter', 'starter',
       'Everything you need to grow your store with advanced tools and more capacity.',
       '7500', NULL, 'monthly', 'JMD', '49', 'USD',
       5, 2, 1, 2000, 2000,
       ARRAY[
         'Full POS features',
         'Advanced inventory',
         'Employee management',
         'Supplier management',
         'Detailed reports',
         'Up to 2,000 products',
         'Up to 2,000 customers',
         '5 user accounts'
       ],
       true, false, 14),

      ('Professional', 'professional',
       'For growing businesses with multiple registers and advanced analytics.',
       '20000', NULL, 'monthly', 'JMD', '129', 'USD',
       20, 10, 3, 10000, 10000,
       ARRAY[
         'Everything in Starter',
         'Multi-branch support (3 branches)',
         'Advanced analytics & reporting',
         'Unlimited products',
         'Unlimited customers',
         '20 user accounts',
         'Priority support',
         'White-label ready'
       ],
       true, true, 14),

      ('Enterprise', 'enterprise',
       'For established operations that need unlimited capacity and dedicated support.',
       '150000', NULL, 'monthly', 'JMD', '999', 'USD',
       999, 999, 999, 999999, 999999,
       ARRAY[
         'Unlimited branches',
         'Unlimited users',
         'Unlimited products & customers',
         'Dedicated account manager',
         'Custom integrations',
         'SLA guarantee',
         'On-premise option'
       ],
       true, false, 0)
    ON CONFLICT DO NOTHING
  `);
  await client.query(`
    UPDATE subscription_plans
    SET
      price = CASE tier
        WHEN 'free' THEN 0
        WHEN 'starter' THEN 7500
        WHEN 'professional' THEN 20000
        WHEN 'enterprise' THEN 150000
        ELSE price
      END,
      currency = CASE
        WHEN tier IN ('free', 'starter', 'professional', 'enterprise') THEN 'JMD'
        ELSE currency
      END,
      checkout_price = CASE tier
        WHEN 'starter' THEN 49
        WHEN 'professional' THEN 129
        WHEN 'enterprise' THEN 999
        ELSE 0
      END,
      checkout_currency = 'USD',
      updated_at = now()
    WHERE tier IN ('free', 'starter', 'professional', 'enterprise')
  `);
  console.log("  ✓ Plans seeded");

  // Also update the Free plan's max_products if it already exists with the old value
  await client.query(`
    UPDATE subscription_plans
    SET max_products = 250
    WHERE tier = 'free' AND max_products = 500
  `);
  await client.query(`
    UPDATE subscription_plans
    SET price = '150000', billing_type = 'monthly'
    WHERE tier = 'enterprise' AND (price = '0' OR billing_type = 'enterprise')
  `);

  // ── 2. Super-admin tenant ──────────────────────────────────────────────
  const tenantRes = await client.query(`
    INSERT INTO tenants (name, email, status)
    VALUES ('Violet Platform', $1, 'active')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [ADMIN_EMAIL]);

  const tenantId = tenantRes.rows[0].id;
  console.log(`  ✓ Admin tenant: ${tenantId}`);

  // ── 3. Super-admin user ────────────────────────────────────────────────
  const pwHash = hashPassword(ADMIN_PASSWORD!);
  await client.query(`
    INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, $3, 'Admin', 'User', 'super_admin')
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      tenant_id = EXCLUDED.tenant_id
  `, [tenantId, ADMIN_EMAIL, pwHash]);
  console.log(`  ✓ Super-admin user: ${ADMIN_EMAIL}`);

  // ── 4. Default settings for admin tenant ──────────────────────────────
  await client.query(`
    INSERT INTO settings (tenant_id, business_name, business_email)
    VALUES ($1, 'Violet Platform', $2)
    ON CONFLICT (tenant_id) DO NOTHING
  `, [tenantId, ADMIN_EMAIL]);

  await client.end();
  console.log("✅  Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
