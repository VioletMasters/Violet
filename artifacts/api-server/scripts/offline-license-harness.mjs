import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const apiDirectory = new URL("..", import.meta.url).pathname;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set before running the offline license harness.");
}

const password = "offline-license-harness-password";
const email = `offline-license-harness-${randomUUID()}@example.test`;
const tenantId = randomUUID();
const userId = randomUUID();
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const passwordHash = hashPassword(password);

let apiProcess;
let apiPort;
let licensePort;

function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForApi() {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const { response } = await request("/api/healthz");
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `Store Host did not become ready.${lastError ? ` ${lastError.message}` : ""}`,
  );
}

function seedDatabase(freePlanId, paidPlanId) {
  const now = new Date().toISOString();
  runSql(`
    INSERT INTO tenants (
      id, name, email, status, plan_id, license_status,
      license_validated_at, license_valid_until
    ) VALUES (
      ${sqlString(tenantId)}, 'Offline License Harness', ${sqlString(email)},
      'active', ${sqlString(paidPlanId)}, 'valid',
      ${sqlString(now)}, ${sqlString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())}
    );
    INSERT INTO users (
      id, tenant_id, email, password_hash, first_name, last_name, role
    ) VALUES (
      ${sqlString(userId)}, ${sqlString(tenantId)}, ${sqlString(email)},
      ${sqlString(passwordHash)}, 'Offline', 'Harness', 'owner'
    );
    INSERT INTO subscriptions (
      tenant_id, plan_id, status, payment_status,
      current_period_start, current_period_end
    ) VALUES (
      ${sqlString(tenantId)}, ${sqlString(paidPlanId)}, 'active', 'paid',
      ${sqlString(now)}, ${sqlString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())}
    );
  `);
}

function setCachedPlan(planId, periodEnd, status = "active") {
  const periodSql = periodEnd === null ? "NULL" : sqlString(periodEnd);
  runSql(`
    UPDATE tenants
    SET plan_id = ${sqlString(planId)},
        license_status = 'valid',
        license_valid_until = ${periodSql},
        updated_at = NOW()
    WHERE id = ${sqlString(tenantId)};
    UPDATE subscriptions
    SET plan_id = ${sqlString(planId)},
        status = ${sqlString(status)},
        payment_status = 'paid',
        current_period_end = ${periodSql},
        updated_at = NOW()
    WHERE tenant_id = ${sqlString(tenantId)};
  `);
}

async function signIn(expectedPlanId, expectedPlanName) {
  const { response, body } = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(response.status === 200, `Offline sign-in failed: ${response.status} ${JSON.stringify(body)}`);
  assert(body?.tenant?.planId === expectedPlanId, `Expected plan ${expectedPlanId}, got ${body?.tenant?.planId}`);
  assert(body?.tenant?.planName === expectedPlanName, `Expected plan name ${expectedPlanName}, got ${body?.tenant?.planName}`);
  assert(typeof body?.token === "string" && body.token.length > 20, "Offline sign-in did not return a session token.");
  return body;
}

async function verifyLocalRequest(token) {
  const { response, body } = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(response.status === 200, `Local authenticated request failed: ${response.status} ${JSON.stringify(body)}`);
  assert(body?.email === email, "Local authenticated request returned the wrong user.");
}

async function cleanup() {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => apiProcess.once("exit", resolve)),
      delay(2_000),
    ]);
    if (!apiProcess.killed) apiProcess.kill("SIGKILL");
  }

  try {
    runSql(`
      DELETE FROM sessions WHERE user_id = ${sqlString(userId)};
      DELETE FROM subscriptions WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM users WHERE id = ${sqlString(userId)};
      DELETE FROM tenants WHERE id = ${sqlString(tenantId)};
    `);
  } catch (error) {
    console.error(`Could not clean up offline license harness data: ${error.message}`);
  }
}

async function main() {
  const plans = runSql(`
    SELECT tier || E'\\t' || id || E'\\t' || replace(name, E'\\t', ' ')
    FROM subscription_plans
    WHERE tier IN ('free', 'starter')
    ORDER BY CASE tier WHEN 'free' THEN 0 ELSE 1 END;
  `)
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [tier, id, name] = row.split("\t");
      return { tier, id, name };
    });
  const freePlan = plans.find((plan) => plan.tier === "free");
  const paidPlan = plans.find((plan) => plan.tier === "starter");
  assert(freePlan && paidPlan, "The local Free and Starter plans must be installed before running this harness.");

  seedDatabase(freePlan.id, paidPlan.id);

  apiPort = await reservePort();
  licensePort = await reservePort();
  apiProcess = spawn(process.execPath, ["--enable-source-maps", "./dist/index.mjs"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(apiPort),
      SESSION_SECRET: sessionSecret,
      VIOLET_RUNTIME_MODE: "self_hosted",
      VIOLET_LICENSE_SERVER_URL: `http://127.0.0.1:${licensePort}`,
      VIOLET_INSTALLATION_ID: `offline-harness-${tenantId}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  apiProcess.stdout.on("data", (chunk) => (logs += chunk));
  apiProcess.stderr.on("data", (chunk) => (logs += chunk));
  apiProcess.once("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      logs += `\nStore Host exited with code ${code}${signal ? ` (${signal})` : ""}`;
    }
  });

  try {
    await waitForApi();

    const active = await signIn(paidPlan.id, paidPlan.name);
    await verifyLocalRequest(active.token);
    console.log("PASS active cached paid period remains paid offline");

    setCachedPlan(
      paidPlan.id,
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    );
    const expired = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(expired.token);
    console.log("PASS expired cached paid period falls back to Free");

    setCachedPlan(paidPlan.id, null);
    const missing = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(missing.token);
    console.log("PASS missing cached paid period falls back to Free");

    setCachedPlan(freePlan.id, null);
    const free = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(free.token);
    const secondFreeSignIn = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(secondFreeSignIn.token);
    console.log("PASS cached Free plan remains usable across offline sign-ins");

    const checkout = await request("/api/billing/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${free.token}` },
      body: JSON.stringify({ tier: "starter" }),
    });
    assert(checkout.response.status === 200, `Offline upgrade request failed: ${checkout.response.status} ${JSON.stringify(checkout.body)}`);
    const expectedUpgradeUrl = new URL("/login", `http://127.0.0.1:${licensePort}`);
    expectedUpgradeUrl.searchParams.set("plan", "starter");
    assert(
      checkout.body?.checkoutUrl === expectedUpgradeUrl.toString(),
      `Unexpected hosted upgrade URL: ${checkout.body?.checkoutUrl}`,
    );
    console.log("PASS local upgrade request returns the hosted upgrade URL");
  } catch (error) {
    const details = logs.trim();
    throw new Error(`${error.message}${details ? `\n\nStore Host logs:\n${details}` : ""}`);
  }
}

try {
  await main();
} finally {
  await cleanup();
}