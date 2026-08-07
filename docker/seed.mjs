#!/usr/bin/env node
/**
 * Violet Enterprise — Docker seed script
 * Runs on container first boot (idempotent).
 * Uses raw pg so it has zero extra dependencies.
 */
import { createRequire } from "module";
import { scryptSync, randomBytes } from "crypto";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!DATABASE_URL) { console.error("ERROR: DATABASE_URL required"); process.exit(1); }
if (!ADMIN_EMAIL)  { console.error("ERROR: ADMIN_EMAIL required");  process.exit(1); }
if (!ADMIN_PASSWORD) { console.error("ERROR: ADMIN_PASSWORD required"); process.exit(1); }

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const client = new Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();
  console.log("🌱  Seeding Violet database...");

  // Plans
  await client.query(`
    INSERT INTO subscription_plans
      (name, tier, description, price, annual_price, billing_type,
       max_users, max_registers, max_branches, max_products, max_customers,
       features, is_active, is_popular, trial_days)
    VALUES
      ('Free','free',
       'Buy once, own forever. Perfect for a single small store with no monthly fees.',
       '0',NULL,'one_time', 2,1,1, 250,500,
       ARRAY['Basic POS (cash & card)','Basic inventory management',
             'Daily sales summary','Up to 250 products',
             'Up to 500 customers','2 user accounts','Violet branding'],
       true,false,0),

      ('Starter','starter',
       'Everything you need to grow your store with advanced tools and more capacity.',
       '49','470','monthly', 5,2,1, 2000,2000,
       ARRAY['Full POS features','Advanced inventory','Employee management',
             'Supplier management','Detailed reports','Up to 2,000 products',
             'Up to 2,000 customers','5 user accounts'],
       true,false,14),

      ('Professional','professional',
       'For growing businesses with multiple registers and advanced analytics.',
       '129','1238','monthly', 20,10,3, 10000,10000,
       ARRAY['Everything in Starter','Multi-branch support (3 branches)',
             'Advanced analytics & reporting','Unlimited products',
             'Unlimited customers','20 user accounts',
             'Priority support','White-label ready'],
       true,true,14),

      ('Enterprise','enterprise',
       'Custom pricing for large operations. Unlimited everything with dedicated support.',
       '0',NULL,'enterprise', 999,999,999, 999999,999999,
       ARRAY['Unlimited branches','Unlimited users',
             'Unlimited products & customers','Dedicated account manager',
             'Custom integrations','SLA guarantee','On-premise option'],
       true,false,0)
    ON CONFLICT DO NOTHING
  `);

  // Fix any existing Free plan with old 500 limit
  await client.query(`
    UPDATE subscription_plans SET max_products = 250
    WHERE tier = 'free' AND max_products = 500
  `);
  console.log("  ✓ Subscription plans");

  // Admin tenant
  const { rows: [{ id: tenantId }] } = await client.query(`
    INSERT INTO tenants (name, email, status)
    VALUES ('Violet Platform', $1, 'active')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [ADMIN_EMAIL]);
  console.log(`  ✓ Admin tenant (${tenantId})`);

  // Admin user
  const pwHash = hashPassword(ADMIN_PASSWORD);
  await client.query(`
    INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, $3, 'Admin', 'User', 'super_admin')
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role          = EXCLUDED.role,
      tenant_id     = EXCLUDED.tenant_id
  `, [tenantId, ADMIN_EMAIL, pwHash]);
  console.log(`  ✓ Super-admin: ${ADMIN_EMAIL}`);

  // Settings
  await client.query(`
    INSERT INTO settings (tenant_id, business_name, business_email)
    VALUES ($1, 'Violet Platform', $2)
    ON CONFLICT (tenant_id) DO NOTHING
  `, [tenantId, ADMIN_EMAIL]);
  console.log("  ✓ Default settings");

  await client.end();
  console.log("✅  Seed complete");
}

main().catch(err => { console.error("Seed failed:", err.message); process.exit(1); });
