import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

const apiDirectory = fileURLToPath(new URL("..", import.meta.url));
const schemaPath = fileURLToPath(new URL("../../../docker/schema.sql", import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set before running the product schema upgrade harness.");
}

const tenantId = "8d7d6de7-7a0e-4a0a-a3e7-4a2f7e0f5c01";
const userId = "8d7d6de7-7a0e-4a0a-a3e7-4a2f7e0f5c02";
const planId = "8d7d6de7-7a0e-4a0a-a3e7-4a2f7e0f5c03";
const legacyProductId = "8d7d6de7-7a0e-4a0a-a3e7-4a2f7e0f5c04";
const email = "product-schema-harness@example.test";
const password = "product-schema-harness-password";
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
let apiProcess;
let apiPort;
let apiLogs = "";

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function runSql(sql) {
  return execFileSync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-At", "-c", sql],
    {
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function applyDockerSchema() {
  execFileSync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-f", schemaPath],
    {
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
      stdio: "inherit",
    },
  );
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local test port."));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function waitForApi() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const { response } = await request("/api/healthz");
      if (response.ok) return;
    } catch {
      // The API may still be binding its port.
    }
    await delay(100);
  }
  throw new Error(`API did not become ready.\n${apiLogs}`);
}

function seedLegacyDatabase() {
  runSql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    DROP TABLE IF EXISTS public.products CASCADE;
    CREATE TABLE public.products (
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      tenant_id uuid NOT NULL,
      category_id uuid,
      name text NOT NULL,
      description text,
      sku text NOT NULL,
      barcode text,
      price numeric(10,2) NOT NULL,
      cost_price numeric(10,2),
      stock integer DEFAULT 0 NOT NULL,
      min_stock integer DEFAULT 5 NOT NULL,
      image_url text,
      is_active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    INSERT INTO public.products (
      id, tenant_id, name, sku, price, stock, min_stock
    ) VALUES (
      ${sqlString(legacyProductId)}, ${sqlString(tenantId)},
      'Legacy product', 'LEGACY-001', 12.50, 7, 2
    );
  `);

  // Run the real bootstrap twice: the first pass upgrades the legacy table and
  // the second pass guards the idempotence promised by the Store Host entrypoint.
  applyDockerSchema();
  applyDockerSchema();

  const legacyProduct = JSON.parse(runSql(`
    SELECT row_to_json(product)
    FROM (
      SELECT id, name, sku, print_destination, warehouse_location
      FROM public.products
      WHERE id = ${sqlString(legacyProductId)}
    ) AS product;
  `));
  assert(legacyProduct?.id === legacyProductId, "The pre-upgrade product row was not preserved.");
  assert(legacyProduct.name === "Legacy product", "The pre-upgrade product name changed.");
  assert(legacyProduct.sku === "LEGACY-001", "The pre-upgrade product SKU changed.");
  assert(
    legacyProduct.print_destination === "customer_receipt",
    `The upgraded product did not receive the default print destination: ${JSON.stringify(legacyProduct)}`,
  );
  assert(
    legacyProduct.warehouse_location === null,
    `The upgraded product warehouse location should be null: ${JSON.stringify(legacyProduct)}`,
  );

  runSql(`
    INSERT INTO public.subscription_plans (
      id, name, tier, price, billing_type, currency, checkout_price, checkout_currency,
      max_users, max_registers, max_branches, max_products, max_customers, features
    ) VALUES (
      ${sqlString(planId)}, 'Free', 'free', 0, 'one_time', 'JMD', 0, 'USD',
      2, 1, 1, 250, 500, ARRAY[]::text[]
    );
    INSERT INTO public.tenants (
      id, name, email, status, plan_id, license_status
    ) VALUES (
      ${sqlString(tenantId)}, 'Product Schema Harness', ${sqlString(email)},
      'active', ${sqlString(planId)}, 'valid'
    );
    INSERT INTO public.users (
      id, tenant_id, email, password_hash, first_name, last_name, role
    ) VALUES (
      ${sqlString(userId)}, ${sqlString(tenantId)}, ${sqlString(email)},
      ${sqlString(hashPassword(password))}, 'Product', 'Harness', 'owner'
    );
    INSERT INTO public.subscriptions (
      tenant_id, plan_id, status, payment_status
    ) VALUES (
      ${sqlString(tenantId)}, ${sqlString(planId)}, 'active', 'not_required'
    );
  `);
}

function startApi() {
  apiProcess = spawn(process.execPath, ["--enable-source-maps", "./dist/index.mjs"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "development",
      PORT: String(apiPort),
      SESSION_SECRET: sessionSecret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  apiProcess.stdout.on("data", (chunk) => (apiLogs += chunk));
  apiProcess.stderr.on("data", (chunk) => (apiLogs += chunk));
}

async function stopApi() {
  const processToStop = apiProcess;
  if (!processToStop) return;
  if (processToStop.exitCode === null && processToStop.signalCode === null) {
    processToStop.kill("SIGTERM");
  }
  await new Promise((resolve) => {
    if (processToStop.exitCode !== null || processToStop.signalCode !== null) {
      resolve();
    } else {
      processToStop.once("exit", resolve);
      setTimeout(resolve, 2_000);
    }
  });
  if (processToStop.exitCode === null && processToStop.signalCode === null) {
    processToStop.kill("SIGKILL");
  }
  apiProcess = undefined;
}

async function main() {
  seedLegacyDatabase();
  apiPort = await reservePort();
  startApi();
  await waitForApi();

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(login.response.status === 200, `Login failed: ${login.response.status} ${JSON.stringify(login.body)}`);
  assert(typeof login.body?.token === "string", `Login did not return a session token: ${JSON.stringify(login.body)}`);

  const managerUnlock = await request("/api/auth/manager-unlock", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ email, password }),
  });
  assert(
    managerUnlock.response.status === 200,
    `Manager unlock failed: ${managerUnlock.response.status} ${JSON.stringify(managerUnlock.body)}`,
  );
  assert(
    typeof managerUnlock.body?.accessToken === "string",
    `Manager unlock did not return an access token: ${JSON.stringify(managerUnlock.body)}`,
  );

  const created = await request("/api/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${login.body.token}`,
      "x-violet-manager-access": managerUnlock.body.accessToken,
    },
    body: JSON.stringify({
      name: "Upgraded product",
      sku: "UPGRADED-001",
      price: 18.75,
      stock: 4,
      minStock: 1,
      printDestination: "kitchen",
      warehouseLocation: "Aisle 4 / Shelf 2",
    }),
  });
  assert(
    created.response.status === 201,
    `Product creation failed after schema upgrade: ${created.response.status} ${JSON.stringify(created.body)}`,
  );
  assert(
    created.response.headers.get("content-type")?.includes("application/json"),
    "Product creation returned a non-JSON response instead of the API error contract.",
  );
  assert(created.body?.name === "Upgraded product", `Created product name was not saved: ${JSON.stringify(created.body)}`);
  assert(created.body?.sku === "UPGRADED-001", `Created product SKU was not saved: ${JSON.stringify(created.body)}`);
  assert(created.body?.printDestination === "kitchen", `Print destination was not saved: ${JSON.stringify(created.body)}`);
  assert(
    created.body?.warehouseLocation === "Aisle 4 / Shelf 2",
    `Warehouse location was not saved: ${JSON.stringify(created.body)}`,
  );

  const counts = runSql(`
    SELECT json_build_object(
      'count', COUNT(*)::int,
      'legacy_name', MAX(name) FILTER (WHERE id = ${sqlString(legacyProductId)}),
      'legacy_sku', MAX(sku) FILTER (WHERE id = ${sqlString(legacyProductId)})
    )
    FROM public.products
    WHERE tenant_id = ${sqlString(tenantId)};
  `);
  const result = JSON.parse(counts);
  assert(result.count === 2, `Expected the legacy and new products to remain, found ${result.count}.`);
  assert(result.legacy_name === "Legacy product", "The legacy product row was changed by product creation.");
  assert(result.legacy_sku === "LEGACY-001", "The legacy product SKU was changed by product creation.");
  console.log("Product schema upgrade regression passed: legacy row preserved and POST /api/products returned 201.");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (apiLogs) console.error(apiLogs);
  process.exitCode = 1;
} finally {
  await stopApi();
}