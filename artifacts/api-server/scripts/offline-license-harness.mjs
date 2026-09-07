import { execFileSync, spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
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
const productId = randomUUID();
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const passwordHash = hashPassword(password);

let apiProcess;
let saleLockProcess;
let apiPort;
let licensePort;
let licenseServer;
let apiLogs = "";
const hostedLicense = {
  available: false,
  credentialsValid: true,
  planTier: null,
  licenseValidUntil: null,
  verifyRequests: 0,
};

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

function holdSaleIdempotencyLock(idempotencyKey) {
  const lockProcess = spawn(
    "psql",
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      databaseUrl,
      "-At",
      "-c",
      `
        SELECT CASE
          WHEN pg_try_advisory_lock(hashtext(${sqlString(tenantId)}), hashtext(${sqlString(idempotencyKey)}))
          THEN 'SALE_LOCK_ACQUIRED'
          ELSE 'SALE_LOCK_NOT_ACQUIRED'
        END;
        SELECT pg_sleep(30);
      `,
    ],
    {
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  saleLockProcess = lockProcess;

  return { ready: waitForSaleLockHeld() };
}

async function waitForSaleLockHeld() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (saleLockProcess?.exitCode !== null || saleLockProcess?.signalCode !== null) {
      throw new Error("The process holding the sale lock exited before checkout started.");
    }
    const heldLocks = Number(runSql(`
      SELECT COUNT(*)
      FROM pg_locks
      WHERE locktype = 'advisory' AND granted = true;
    `));
    if (heldLocks > 0) return;
    await delay(100);
  }
  throw new Error("Could not observe the sale transaction lock before checkout.");
}

async function releaseSaleIdempotencyLock() {
  const processToStop = saleLockProcess;
  if (!processToStop) return;

  saleLockProcess = undefined;
  if (processToStop.exitCode === null && processToStop.signalCode === null) {
    processToStop.kill("SIGKILL");
  }
  await new Promise((resolve) => {
    if (processToStop.exitCode !== null || processToStop.signalCode !== null) {
      resolve();
    } else {
      processToStop.once("exit", resolve);
      setTimeout(resolve, 2_000);
    }
  });
}

async function waitForBlockedSale() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const waitingLocks = Number(runSql(`
      SELECT COUNT(*)
      FROM pg_locks
      WHERE locktype = 'advisory' AND granted = false;
    `));
    if (waitingLocks > 0) return;
    await delay(100);
  }
  throw new Error("Checkout did not reach the sale transaction before the shutdown.");
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

async function startLicenseServer() {
  const server = createHttpServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/api/license/verify") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ valid: false, message: "Not found" }));
      return;
    }

    hostedLicense.verifyRequests += 1;
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body || "{}");
    if (
      !hostedLicense.credentialsValid ||
      payload.email !== email ||
      payload.password !== password
    ) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ valid: false, message: "Invalid credentials" }));
      return;
    }
    if (!hostedLicense.available) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        valid: false,
        message: "Hosted licensing is temporarily unavailable.",
      }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      valid: true,
      message: "Online license verified.",
      planTier: hostedLicense.planTier,
      subscriptionStatus: "active",
      paymentStatus: "paid",
      licenseStatus: "valid",
      licenseValidUntil: hostedLicense.licenseValidUntil,
      licenseSessionToken: `harness-license-${randomUUID()}`,
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(licensePort, "127.0.0.1", resolve);
  });
  return server;
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

function spawnApiProcess({ databaseUrlOverride = databaseUrl } = {}) {
  apiProcess = spawn(process.execPath, ["--enable-source-maps", "./dist/index.mjs"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrlOverride,
      NODE_ENV: "development",
      PORT: String(apiPort),
      SESSION_SECRET: sessionSecret,
      VIOLET_RUNTIME_MODE: "self_hosted",
      VIOLET_LICENSE_SERVER_URL: `http://127.0.0.1:${licensePort}`,
      VIOLET_INSTALLATION_ID: `offline-harness-${tenantId}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  apiProcess.stdout.on("data", (chunk) => (apiLogs += chunk));
  apiProcess.stderr.on("data", (chunk) => (apiLogs += chunk));
  apiProcess.once("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      apiLogs += `\nStore Host exited with code ${code}${signal ? ` (${signal})` : ""}`;
    }
  });
}

async function waitForDataStoreFailure() {
  const deadline = Date.now() + 10_000;
  let lastResponse;
  while (Date.now() < deadline) {
    try {
      lastResponse = await request("/api/healthz");
      if (lastResponse.response.status === 503) return lastResponse;
    } catch {
      // The process may still be binding its port.
    }
    await delay(100);
  }
  throw new Error(
    `Store Host did not report its local data-store failure.${lastResponse ? ` Last response: ${lastResponse.response.status}` : ""}`,
  );
}

async function stopApiProcess({ force = false } = {}) {
  const processToStop = apiProcess;
  if (!processToStop) return;

  const exited = new Promise((resolve) => {
    if (processToStop.exitCode !== null || processToStop.signalCode !== null) {
      resolve();
    } else {
      processToStop.once("exit", resolve);
    }
  });

  if (processToStop.exitCode === null && processToStop.signalCode === null) {
    processToStop.kill(force ? "SIGKILL" : "SIGTERM");
  }

  if (force) {
    await Promise.race([exited, delay(2_000)]);
  } else {
    await Promise.race([exited, delay(2_000)]);

    if (processToStop.exitCode === null && processToStop.signalCode === null) {
      processToStop.kill("SIGKILL");
      await Promise.race([exited, delay(1_000)]);
    }
  }
  apiProcess = undefined;
}

async function restartApi({ force = false } = {}) {
  await stopApiProcess({ force });
  apiPort = await reservePort();
  spawnApiProcess();
  await waitForApi();
}

function seedDatabase(freePlanId, paidPlanId) {
  const now = new Date().toISOString();
  runSql(`
    INSERT INTO tenants (
      id, name, email, status, plan_id, license_status,
      license_validated_at, license_valid_until
    ) VALUES (
      ${sqlString(tenantId)}, 'Offline License Harness', ${sqlString(email)},
      'active', ${sqlString(freePlanId)}, 'valid',
      ${sqlString(now)}, NULL
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
      ${sqlString(tenantId)}, ${sqlString(freePlanId)}, 'active', 'not_required',
      ${sqlString(now)}, NULL
    );
    INSERT INTO products (
      id, tenant_id, name, sku, price, cost_price, stock, min_stock, is_active
    ) VALUES (
      ${sqlString(productId)}, ${sqlString(tenantId)}, 'Forced Shutdown Harness Product',
      ${sqlString(`HARNESS-${productId.slice(0, 8)}`)}, '12.50', '5.00', 3, 1, true
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

async function verifyLocalPosAccess(token) {
  const { response, body } = await request("/api/pos/products", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(response.status === 200, `Local POS request failed: ${response.status} ${JSON.stringify(body)}`);
  assert(
    body?.data?.some((product) => product.id === productId),
    "Local POS request did not return the seeded product.",
  );
}

async function verifyLocalSubscription(token, expectedPlanId, expectedPlanTier, expectedPlanName) {
  const { response, body } = await request("/api/subscription", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(response.status === 200, `Local subscription request failed: ${response.status} ${JSON.stringify(body)}`);
  assert(body?.planId === expectedPlanId, `Expected local subscription plan ${expectedPlanId}, got ${body?.planId}`);
  assert(body?.plan?.tier === expectedPlanTier, `Expected local subscription tier ${expectedPlanTier}, got ${body?.plan?.tier}`);
  assert(body?.plan?.name === expectedPlanName, `Expected local subscription name ${expectedPlanName}, got ${body?.plan?.name}`);
}

async function createSale(token, idempotencyKey) {
  return request("/api/sales", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      idempotencyKey,
      paymentMethod: "cash",
      cashTendered: 20,
      items: [{ productId, quantity: 1 }],
    }),
  });
}

async function verifyRecoveredSale(token, managerAccessToken, idempotencyKey, expectedSaleId) {
  const managerHeaders = {
    Authorization: `Bearer ${token}`,
    "x-violet-manager-access": managerAccessToken,
  };
  const inventory = await request("/api/inventory?search=Forced%20Shutdown%20Harness%20Product", {
    headers: managerHeaders,
  });
  assert(inventory.response.status === 200, `Recovered inventory request failed: ${inventory.response.status} ${JSON.stringify(inventory.body)}`);
  const recoveredProduct = inventory.body?.data?.find((item) => item.productId === productId);
  assert(recoveredProduct?.stock === 2, `Expected recovered stock to be 2, got ${recoveredProduct?.stock}`);

  const sales = await request("/api/sales?limit=100", {
    headers: managerHeaders,
  });
  assert(sales.response.status === 200, `Recovered sales request failed: ${sales.response.status} ${JSON.stringify(sales.body)}`);
  const matchingSales = sales.body?.data?.filter((sale) => sale.id === expectedSaleId && sale.tenantId === tenantId) ?? [];
  assert(matchingSales.length === 1, `Expected one recovered sale in the Store Host API, got ${matchingSales.length}`);
  assert(matchingSales[0].totalAmount === 12.5, `Expected recovered sale total to be 12.50, got ${matchingSales[0].totalAmount}`);
  assert(matchingSales[0].items?.length === 1 && matchingSales[0].items[0].quantity === 1, "Recovered sale has incorrect line items.");
  assert(matchingSales[0].payments?.length === 1 && matchingSales[0].payments[0].amount === 12.5, "Recovered sale has incorrect payment records.");

  const [salesCount, itemCount, paymentCount, movementCount, stock] = runSql(`
    SELECT COUNT(*) FROM sales
      WHERE tenant_id = ${sqlString(tenantId)} AND idempotency_key = ${sqlString(idempotencyKey)};
    SELECT COUNT(*) FROM sale_items
      WHERE sale_id IN (
        SELECT id FROM sales
        WHERE tenant_id = ${sqlString(tenantId)} AND idempotency_key = ${sqlString(idempotencyKey)}
      );
    SELECT COUNT(*) FROM sale_payments
      WHERE tenant_id = ${sqlString(tenantId)} AND sale_id IN (
        SELECT id FROM sales
        WHERE tenant_id = ${sqlString(tenantId)} AND idempotency_key = ${sqlString(idempotencyKey)}
      );
    SELECT COUNT(*) FROM inventory_movements
      WHERE tenant_id = ${sqlString(tenantId)} AND product_id = ${sqlString(productId)}
        AND sale_id IN (
          SELECT id FROM sales
          WHERE tenant_id = ${sqlString(tenantId)} AND idempotency_key = ${sqlString(idempotencyKey)}
        );
    SELECT stock FROM products
      WHERE tenant_id = ${sqlString(tenantId)} AND id = ${sqlString(productId)};
  `).split("\n");
  assert(salesCount === "1", `Expected exactly one financial sale record, got ${salesCount}`);
  assert(itemCount === "1", `Expected exactly one sale item record, got ${itemCount}`);
  assert(paymentCount === "1", `Expected exactly one payment record, got ${paymentCount}`);
  assert(movementCount === "1", `Expected exactly one sale inventory movement, got ${movementCount}`);
  assert(stock === "2", `Expected database stock to be 2, got ${stock}`);
}

async function cleanup() {
  await releaseSaleIdempotencyLock();
  await stopApiProcess();
  if (licenseServer) {
    await new Promise((resolve) => licenseServer.close(resolve));
    licenseServer = undefined;
  }

  try {
    runSql(`
      DELETE FROM sale_discounts WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = ${sqlString(tenantId)});
      DELETE FROM sale_payments WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = ${sqlString(tenantId)});
      DELETE FROM cash_events WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM inventory_movements WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM audit_events WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM sales WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM products WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM sessions WHERE user_id = ${sqlString(userId)};
      DELETE FROM subscriptions WHERE tenant_id = ${sqlString(tenantId)};
      DELETE FROM users WHERE id = ${sqlString(userId)};
      DELETE FROM tenants WHERE id = ${sqlString(tenantId)};
    `);

    const remainingFixtures = runSql(`
      SELECT COUNT(*) FROM sessions WHERE user_id = ${sqlString(userId)}
      UNION ALL
      SELECT COUNT(*) FROM subscriptions WHERE tenant_id = ${sqlString(tenantId)}
      UNION ALL
      SELECT COUNT(*) FROM users WHERE id = ${sqlString(userId)}
      UNION ALL
      SELECT COUNT(*) FROM tenants WHERE id = ${sqlString(tenantId)}
      UNION ALL
      SELECT COUNT(*) FROM products WHERE id = ${sqlString(productId)}
      UNION ALL
      SELECT COUNT(*) FROM sales WHERE tenant_id = ${sqlString(tenantId)}
      UNION ALL
      SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = ${sqlString(tenantId)};
    `);
    if (remainingFixtures.split("\n").some((count) => count !== "0")) {
      throw new Error(`Fixture cleanup left rows behind: ${remainingFixtures}`);
    }
  } catch (error) {
    throw new Error(`Could not clean up offline license harness data: ${error.message}`);
  }
}

async function main() {
  const plans = runSql(`
    SELECT tier || E'\\t' || id || E'\\t' || replace(name, E'\\t', ' ')
    FROM subscription_plans
    WHERE tier IN ('free', 'starter', 'professional', 'enterprise')
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
  licenseServer = await startLicenseServer();
  spawnApiProcess();

  try {
    await waitForApi();

    assert(
      hostedLicense.verifyRequests === 0,
      `Store Host startup contacted hosted licensing ${hostedLicense.verifyRequests} time(s).`,
    );
    const unavailable = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(unavailable.token);
    await verifyLocalPosAccess(unavailable.token);
    console.log("PASS new local Store Host starts Free without hosted validation and serves the POS offline");

    hostedLicense.credentialsValid = false;
    const invalidHostedCredentials = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(invalidHostedCredentials.token);
    await verifyLocalPosAccess(invalidHostedCredentials.token);
    assert(
      hostedLicense.verifyRequests > 0,
      "Local sign-in did not attempt hosted validation before falling back to Free.",
    );
    console.log("PASS invalid hosted credentials never grant a paid plan and still allow local Free sign-in");

    hostedLicense.credentialsValid = true;
    setCachedPlan(
      paidPlan.id,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
    const active = await signIn(paidPlan.id, paidPlan.name);
    await verifyLocalRequest(active.token);
    await restartApi();
    await verifyLocalRequest(active.token);
    console.log("PASS active cached paid period remains paid after a Store Host restart");
    await restartApi({ force: true });
    await verifyLocalRequest(active.token);
    const activeAfterForcedRestart = await signIn(paidPlan.id, paidPlan.name);
    await verifyLocalRequest(activeAfterForcedRestart.token);
    console.log("PASS active cached paid period and local session survive forced Store Host termination");

    setCachedPlan(
      paidPlan.id,
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    );
    const expired = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(expired.token);
    await restartApi({ force: true });
    await verifyLocalRequest(expired.token);
    const expiredAfterForcedRestart = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(expiredAfterForcedRestart.token);
    console.log("PASS expired cached paid period falls back to Free after forced Store Host termination");

    setCachedPlan(paidPlan.id, null);
    const missing = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(missing.token);
    await restartApi({ force: true });
    await verifyLocalRequest(missing.token);
    const missingAfterForcedRestart = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(missingAfterForcedRestart.token);
    console.log("PASS missing cached paid period falls back to Free after forced Store Host termination");

    setCachedPlan(freePlan.id, null);
    const free = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(free.token);
    await restartApi({ force: true });
    await verifyLocalRequest(free.token);
    const freeAfterForcedRestart = await signIn(freePlan.id, freePlan.name);
    await verifyLocalRequest(freeAfterForcedRestart.token);
    console.log("PASS cached Free plan and local sessions remain usable after forced Store Host termination");

    hostedLicense.available = true;
    for (const hostedPlan of plans.filter((plan) => plan.tier !== "free")) {
      setCachedPlan(freePlan.id, null, "active");
      hostedLicense.planTier = hostedPlan.tier;
      hostedLicense.licenseValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const upgraded = await signIn(hostedPlan.id, hostedPlan.name);
      await verifyLocalSubscription(upgraded.token, hostedPlan.id, hostedPlan.tier, hostedPlan.name);
      console.log(`PASS online sign-in upgrades the cached Free plan to hosted ${hostedPlan.name}`);
    }

    hostedLicense.planTier = paidPlan.tier;
    const upgraded = await signIn(paidPlan.id, paidPlan.name);
    await verifyLocalSubscription(upgraded.token, paidPlan.id, paidPlan.tier, paidPlan.name);

    const managerUnlock = await request("/api/auth/manager-unlock", {
      method: "POST",
      headers: { Authorization: `Bearer ${upgraded.token}` },
      body: JSON.stringify({ email, password }),
    });
    assert(managerUnlock.response.status === 200, `Manager unlock failed: ${managerUnlock.response.status} ${JSON.stringify(managerUnlock.body)}`);
    const managerAccessToken = managerUnlock.body?.accessToken;
    assert(typeof managerAccessToken === "string" && managerAccessToken.length > 20, "Manager unlock did not return an access token.");

    const saleIdempotencyKey = `forced-checkout-${randomUUID()}`;
    const saleLock = holdSaleIdempotencyLock(saleIdempotencyKey);
    let interruptedCheckout;
    try {
      await saleLock.ready;
      const checkoutInProgress = createSale(upgraded.token, saleIdempotencyKey).then(
        ({ response, body }) => ({ kind: "response", status: response.status, body }),
        (error) => ({ kind: "error", error }),
      );
      await waitForBlockedSale();
      await stopApiProcess({ force: true });
      await releaseSaleIdempotencyLock();
      interruptedCheckout = await Promise.race([
        checkoutInProgress,
        delay(3_000).then(() => ({ kind: "timeout" })),
      ]);
    } finally {
      await releaseSaleIdempotencyLock();
    }
    assert(
      interruptedCheckout?.kind === "error",
      `Expected forced shutdown to interrupt the checkout request, got ${JSON.stringify(interruptedCheckout)}`,
    );

    const [salesAfterShutdown, movementsAfterShutdown, stockAfterShutdown] = runSql(`
      SELECT COUNT(*) FROM sales
        WHERE tenant_id = ${sqlString(tenantId)} AND idempotency_key = ${sqlString(saleIdempotencyKey)};
      SELECT COUNT(*) FROM inventory_movements
        WHERE tenant_id = ${sqlString(tenantId)} AND product_id = ${sqlString(productId)}
          AND reason = 'sale';
      SELECT stock FROM products
        WHERE tenant_id = ${sqlString(tenantId)} AND id = ${sqlString(productId)};
    `).split("\n");
    assert(salesAfterShutdown === "0", `Forced shutdown left a partial sale record: ${salesAfterShutdown}`);
    assert(movementsAfterShutdown === "0", `Forced shutdown left a partial inventory movement: ${movementsAfterShutdown}`);
    assert(stockAfterShutdown === "3", `Forced shutdown changed inventory before commit: ${stockAfterShutdown}`);

    await restartApi();
    const recoveredCheckout = await createSale(upgraded.token, saleIdempotencyKey);
    assert(recoveredCheckout.response.status === 201, `Recovered checkout failed: ${recoveredCheckout.response.status} ${JSON.stringify(recoveredCheckout.body)}`);
    const recoveredSaleId = recoveredCheckout.body?.id;
    assert(typeof recoveredSaleId === "string", "Recovered checkout did not return a sale id.");

    const duplicateRetry = await createSale(upgraded.token, saleIdempotencyKey);
    assert(duplicateRetry.response.status === 200, `Duplicate checkout retry failed: ${duplicateRetry.response.status} ${JSON.stringify(duplicateRetry.body)}`);
    assert(duplicateRetry.body?.id === recoveredSaleId, "Duplicate checkout retry created a different sale.");

    await restartApi({ force: true });
    const duplicateRetryAfterRestart = await createSale(upgraded.token, saleIdempotencyKey);
    assert(duplicateRetryAfterRestart.response.status === 200, `Post-restart checkout retry failed: ${duplicateRetryAfterRestart.response.status} ${JSON.stringify(duplicateRetryAfterRestart.body)}`);
    assert(duplicateRetryAfterRestart.body?.id === recoveredSaleId, "Post-restart checkout retry created a different sale.");
    await verifyRecoveredSale(upgraded.token, managerAccessToken, saleIdempotencyKey, recoveredSaleId);
    console.log("PASS forced Store Host shutdown rolls back an in-flight checkout and recovery commits it exactly once");

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

    await stopApiProcess();
    apiPort = await reservePort();
    spawnApiProcess({
      databaseUrlOverride: "postgresql://violet:violetpass@127.0.0.1:1/violetdb",
    });
    const unavailableStore = await waitForDataStoreFailure();
    assert(unavailableStore.body?.status === "error", "Unavailable Store Host health check did not report an error status.");
    assert(
      unavailableStore.body?.code === "LOCAL_DATA_STORE_UNAVAILABLE",
      `Unavailable Store Host health check returned the wrong code: ${JSON.stringify(unavailableStore.body)}`,
    );
    assert(
      unavailableStore.body?.error?.includes("Existing store data was not changed"),
      `Unavailable Store Host health check did not provide recovery guidance: ${JSON.stringify(unavailableStore.body)}`,
    );

    const unavailableLogin = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    assert(
      unavailableLogin.response.status === 503 &&
        unavailableLogin.body?.code === "LOCAL_DATA_STORE_UNAVAILABLE",
      `Unavailable Store Host login returned the wrong recovery response: ${unavailableLogin.response.status} ${JSON.stringify(unavailableLogin.body)}`,
    );
    const originalDataStillPresent = runSql(`
      SELECT COUNT(*) FROM tenants WHERE id = ${sqlString(tenantId)};
    `);
    assert(originalDataStillPresent === "1", "The unavailable-data-store path changed the existing Store Host data.");
    console.log("PASS unavailable Store Host data returns recovery guidance without changing existing data");
  } catch (error) {
    const details = apiLogs.trim();
    throw new Error(`${error.message}${details ? `\n\nStore Host logs:\n${details}` : ""}`);
  }
}

try {
  await main();
} finally {
  await cleanup();
}