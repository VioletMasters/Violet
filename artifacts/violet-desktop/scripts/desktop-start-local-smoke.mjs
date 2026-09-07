import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const appPath = resolve(process.argv[2] ?? "");
const cdpPort = Number(process.env.VIOLET_SMOKE_CDP_PORT ?? 9222);
const localEmail = "desktop-smoke@example.com";
const localPassword = "desktop-smoke-password-123";
const hostedLicenseUrl = "https://Violetsolutions.replit.app";
const outageLicenseUrl = "http://127.0.0.1:9";

if (!appPath || !existsSync(appPath)) {
  throw new Error(`Packaged desktop executable was not found: ${appPath}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.requests = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Network.requestWillBeSent") {
        this.requests.push(message.params.request.url);
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("The packaged app DevTools connection closed."));
      }
      this.pending.clear();
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCall, rejectCall) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectCall(new Error(`Timed out waiting for CDP ${method}.`));
      }, 15_000);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolveCall(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectCall(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "The page evaluation failed.");
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function getPageTarget() {
  const deadline = Date.now() + 60_000;
  let lastError = "No WebView2 page target was reported.";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await response.json();
      const target = targets.find(
        (candidate) => candidate.webSocketDebuggerUrl && candidate.type === "page",
      );
      if (target) return target;
      lastError = "The packaged app DevTools endpoint has no page target yet.";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(lastError);
}

async function connectToPage() {
  const target = await getPageTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  const page = new CdpClient(socket);
  await page.call("Runtime.enable");
  await page.call("Network.enable");
  return page;
}

async function evaluate(page, expression) {
  try {
    return await page.evaluate(expression);
  } catch (error) {
    // A Tauri navigation can briefly replace the WebView2 execution context.
    page.close();
    const reconnected = await connectToPage();
    return await reconnected.evaluate(expression);
  }
}

async function waitFor(page, description, check, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(page, check);
      if (value) return value;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  const body = await evaluate(page, "document.body?.innerText ?? ''").catch(() => "");
  throw new Error(
    `Timed out waiting for ${description}.${lastError ? ` Last error: ${lastError}.` : ""}\n${body}`,
  );
}

async function clickButton(page, text) {
  const clicked = await evaluate(
    page,
    `(function () {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.trim().includes(${JSON.stringify(text)}));
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Could not find the packaged app button: ${text}`);
}

async function setInput(page, selector, value) {
  const set = await evaluate(
    page,
    `(function () {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  if (!set) throw new Error(`Could not find packaged app input: ${selector}`);
}

async function pageUrl(page) {
  return evaluate(page, "location.href");
}

function assertLocalLoginUrl(url) {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !parsed.pathname.endsWith("/login")) {
    throw new Error(`Start locally did not open the local login page: ${url}`);
  }
}

function findConfigFile(root) {
  if (!existsSync(root)) return null;
  const queue = [{ directory: root, depth: 0 }];
  while (queue.length) {
    const { directory, depth } = queue.shift();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name === "violet-config.json") return path;
      if (entry.isDirectory() && depth < 4) queue.push({ directory: path, depth: depth + 1 });
    }
  }
  return null;
}

function assertPersistedHostConfig() {
  const appData = process.env.APPDATA ?? "";
  const configPath = findConfigFile(appData);
  if (!configPath) throw new Error(`The desktop app did not persist violet-config.json under ${appData}.`);
  const config = readFileSync(configPath, "utf8");
  if (!config.includes('"violet_mode"') || !config.includes('"host"')) {
    throw new Error(`The desktop app did not persist host mode in ${configPath}: ${config}`);
  }
  if (!config.includes("http://127.0.0.1")) {
    throw new Error(`The desktop app did not persist the local Store Host URL in ${configPath}: ${config}`);
  }
  return configPath;
}

function findManagedHostDirectory() {
  const appData = process.env.APPDATA ?? "";
  const directory = join(appData, "com.violetenterprise.desktop", "store-host");
  if (!existsSync(join(directory, "docker-compose.yml"))) {
    throw new Error(`The packaged app did not install its Store Host files at ${directory}.`);
  }
  return directory;
}

function replaceLicenseEndpoint(directory, endpoint) {
  const envPath = join(directory, ".env");
  const current = readFileSync(envPath, "utf8");
  const updated = current.replace(
    /^VIOLET_LICENSE_SERVER_URL=.*$/m,
    `VIOLET_LICENSE_SERVER_URL='${endpoint}'`,
  );
  if (updated === current) {
    throw new Error(`Could not replace VIOLET_LICENSE_SERVER_URL in ${envPath}.`);
  }
  writeFileSync(envPath, updated);
}

function restartApi(directory) {
  const result = spawnSync(
    "docker",
    ["compose", "-f", join(directory, "docker-compose.yml"), "up", "-d", "--force-recreate", "api"],
    { cwd: directory, encoding: "utf8", stdio: "pipe" },
  );
  if (result.status !== 0) {
    throw new Error(`Could not restart the local API for the outage check:\n${result.stdout}\n${result.stderr}`);
  }
}

function stopProcess(child) {
  if (!child || child.killed) return;
  if (globalThis.process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function startApp() {
  const child = spawn(appPath, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: "ignore",
  });
  await sleep(1_000);
  if (child.exitCode !== null) {
    throw new Error(`The packaged desktop app exited during startup with code ${child.exitCode}.`);
  }
  return child;
}

let app;
let page;
let managedDirectory;
try {
  const dockerCheck = spawnSync("docker", ["version"], { encoding: "utf8", stdio: "pipe" });
  const composeCheck = spawnSync("docker", ["compose", "version"], { encoding: "utf8", stdio: "pipe" });
  if (dockerCheck.status !== 0 || composeCheck.status !== 0) {
    throw new Error(
      `Docker Desktop and Docker Compose must be available for the packaged Store Host smoke test.\n` +
        `${dockerCheck.stderr}\n${composeCheck.stderr}`,
    );
  }

  app = await startApp();
  page = await connectToPage();
  await waitFor(page, "the packaged desktop setup screen", "() => document.body?.innerText?.includes('Start locally')");

  await clickButton(page, "Start locally");
  await waitFor(page, "the local admin form", "() => document.querySelector('input[type=email]')");
  await setInput(page, 'input[type="email"]', localEmail);
  await setInput(page, 'input[type="password"]', localPassword);
  await clickButton(page, "Start locally (Free)");

  await waitFor(
    page,
    "the local login page after Start locally",
    "() => /\\/login(?:[/?#]|$)/.test(location.href) && ['127.0.0.1', 'localhost'].includes(location.hostname)",
  );
  const firstLoginUrl = await pageUrl(page);
  assertLocalLoginUrl(firstLoginUrl);
  const configPath = assertPersistedHostConfig();
  managedDirectory = findManagedHostDirectory();

  // Make the hosted license service unreachable without touching the network
  // outside this Store Host. The local password hash is already cached, so a
  // Free tenant must still be allowed to sign in through the offline fallback.
  replaceLicenseEndpoint(managedDirectory, outageLicenseUrl);
  restartApi(managedDirectory);
  await setInput(page, 'input[type="email"]', localEmail);
  await setInput(page, 'input[type="password"]', localPassword);
  await clickButton(page, "Sign in");
  await waitFor(
    page,
    "the local Free app after hosted license outage",
    "() => location.hostname === '127.0.0.1' && !/\\/login(?:[/?#]|$)/.test(location.pathname)",
    45_000,
  );
  const localAppUrl = await pageUrl(page);
  if (new URL(localAppUrl).hostname !== "127.0.0.1") {
    throw new Error(`Offline Free sign-in left the local Store Host: ${localAppUrl}`);
  }
  const authState = await evaluate(
    page,
    "JSON.parse(localStorage.getItem('violet_auth') || 'null')",
  );
  if (authState?.tenant?.planName !== "Free") {
    throw new Error(
      `Offline sign-in did not use the local Free plan: ${JSON.stringify(authState?.tenant ?? null)}`,
    );
  }

  // A browser-level hosted request would indicate that the Start locally
  // button accidentally followed the hosted startup path. The API's own
  // outage probe is expected to use the unreachable local endpoint above.
  const hostedRequests = page.requests.filter((url) =>
    url.toLowerCase().startsWith(hostedLicenseUrl.toLowerCase()),
  );
  if (hostedRequests.length > 0) {
    throw new Error(`The packaged app made a hosted browser request: ${hostedRequests.join(", ")}`);
  }
  console.log(`Start locally smoke test passed: ${configPath}`);

  await page.call("Network.clearBrowserCookies").catch(() => undefined);
  await page
    .call("Storage.clearDataForOrigin", {
      origin: "http://127.0.0.1",
      storageTypes: "all",
    })
    .catch(() => undefined);
  stopProcess(app);
  app = await startApp();
  page = await connectToPage();
  await waitFor(
    page,
    "the resumed local Store Host login page",
    "() => ['127.0.0.1', 'localhost'].includes(location.hostname) && /\\/login(?:[/?#]|$)/.test(location.pathname)",
    60_000,
  );
  const resumedUrl = await pageUrl(page);
  assertLocalLoginUrl(resumedUrl);
  console.log("Store Host resume smoke test passed.");
} finally {
  if (page) page.close();
  stopProcess(app);
  if (managedDirectory && existsSync(join(managedDirectory, "docker-compose.yml"))) {
    spawnSync(
      "docker",
      ["compose", "-f", join(managedDirectory, "docker-compose.yml"), "down", "--volumes", "--remove-orphans"],
      { cwd: managedDirectory, stdio: "ignore" },
    );
  }
}
