import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type RegistrationResponse = {
  token?: string;
  user?: {
    tenantId?: string;
  };
  tenant?: {
    id?: string;
  };
};

type ReleaseAsset = {
  platform?: string;
  fileName?: string;
  downloadUrl?: string;
};

type ReleaseResponse = {
  id?: string;
  version?: string;
  channel?: string;
  assets?: ReleaseAsset[];
};

const stagingBaseURL = requireUrl(
  "PLAYWRIGHT_STAGING_BASE_URL",
  process.env.PLAYWRIGHT_STAGING_BASE_URL,
);
const checkoutOrigin = requireOrigin(
  "PLAYWRIGHT_STAGING_CHECKOUT_ORIGIN",
  process.env.PLAYWRIGHT_STAGING_CHECKOUT_ORIGIN,
);
const expectedReleaseVersion = requireValue(
  "PLAYWRIGHT_STAGING_RELEASE_VERSION",
  process.env.PLAYWRIGHT_STAGING_RELEASE_VERSION,
);
const expectedAssetPlatform = requireValue(
  "PLAYWRIGHT_STAGING_RELEASE_ASSET_PLATFORM",
  process.env.PLAYWRIGHT_STAGING_RELEASE_ASSET_PLATFORM,
);
const expectedAssetFileName = requireValue(
  "PLAYWRIGHT_STAGING_RELEASE_ASSET_FILE",
  process.env.PLAYWRIGHT_STAGING_RELEASE_ASSET_FILE,
);
const noReleaseChannel = process.env.PLAYWRIGHT_STAGING_NO_RELEASE_CHANNEL ?? "nightly";

function requireValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `${name} is required for the staging onboarding suite. See tests/README.md.`,
    );
  }
  return value;
}

function requireUrl(name: string, value: string | undefined) {
  const url = requireValue(name, value);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function requireOrigin(name: string, value: string | undefined) {
  const url = requireUrl(name, value);
  return new URL(url).origin;
}

function disposableAccount(label: string) {
  const id = `${label}-${randomUUID()}`;
  return {
    businessName: `Violet ${label} staging ${id.slice(0, 8)}`,
    firstName: "Staging",
    lastName: "Owner",
    email: `${id}@staging.invalid`,
    password: `Staging-${randomUUID()}-Account`,
  };
}

async function fillRegistration(page: Page, account: ReturnType<typeof disposableAccount>) {
  await page.getByLabel("Business Name").fill(account.businessName);
  await page.getByLabel("First Name").fill(account.firstName);
  await page.getByLabel("Last Name").fill(account.lastName);
  await page.getByLabel("Work Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
}

async function register(
  page: Page,
  account: ReturnType<typeof disposableAccount>,
  submitButtonName: string | RegExp = "Create free account",
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/api/auth/register") &&
      response.request().method() === "POST",
  );
  await fillRegistration(page, account);
  await page.getByRole("button", { name: submitButtonName }).click();
  const response = await responsePromise;
  expect(response.status(), "staging registration should create the account").toBe(201);
  return (await response.json()) as RegistrationResponse;
}

function manualRecoveryMessage(
  account: ReturnType<typeof disposableAccount>,
  tenantId: string | undefined,
  reason: string,
) {
  return [
    `Staging teardown was interrupted for ${account.email}.`,
    `Manual recovery: cancel any pending hosted checkout for this account, then remove tenant ${tenantId ?? "(tenant ID unavailable)"}`,
    `(${account.email}) and its related records through the approved staging admin process.`,
    `Reason: ${reason}`,
  ].join(" ");
}

async function cleanupDisposableAccount(
  request: APIRequestContext,
  account: ReturnType<typeof disposableAccount>,
  registration: RegistrationResponse | undefined,
  baseURL: string,
) {
  if (!registration) return;
  const token = registration?.token;
  const tenantId = registration?.tenant?.id ?? registration?.user?.tenantId;
  if (!token || !tenantId) {
    throw new Error(manualRecoveryMessage(account, tenantId, "registration did not return a cleanup token and tenant ID"));
  }

  const response = await request.delete(
    new URL(`/api/admin/staging/tenants/${encodeURIComponent(tenantId)}`, baseURL).toString(),
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { confirmStagingCleanup: true },
    },
  );
  if (!response.ok()) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      manualRecoveryMessage(
        account,
        tenantId,
        `cleanup endpoint returned HTTP ${response.status()}${responseBody ? `: ${responseBody}` : ""}`,
      ),
    );
  }
}

async function cancelPendingCheckout(
  request: APIRequestContext,
  account: ReturnType<typeof disposableAccount>,
  token: string | undefined,
  tenantId: string | undefined,
  baseURL: string,
) {
  if (!token) return;
  const response = await request.delete(
    new URL("/api/billing/checkout", baseURL).toString(),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok()) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      manualRecoveryMessage(
        account,
        tenantId,
        `pending checkout cancellation returned HTTP ${response.status()}${responseBody ? `: ${responseBody}` : ""}`,
      ),
    );
  }
}

function registrationTenantId(registration: RegistrationResponse | undefined) {
  return registration?.tenant?.id ?? registration?.user?.tenantId;
}

async function assertCleanup(
  request: APIRequestContext,
  account: ReturnType<typeof disposableAccount>,
  registration: RegistrationResponse | undefined,
  baseURL: string,
) {
  try {
    await cleanupDisposableAccount(request, account, registration, baseURL);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(manualRecoveryMessage(account, registrationTenantId(registration), String(error)));
  }
}

async function assertCheckoutCancellation(
  request: APIRequestContext,
  account: ReturnType<typeof disposableAccount>,
  token: string | undefined,
  baseURL: string,
  tenantId: string | undefined,
) {
  try {
    await cancelPendingCheckout(request, account, token, tenantId, baseURL);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(manualRecoveryMessage(account, tenantId, String(error)));
  }
}

test("disposable free registration reaches the real download page", async ({ page }) => {
  const account = disposableAccount("free");
  let registration: RegistrationResponse | undefined;

  try {
    await page.goto("/register");
    registration = await register(page, account);

    await expect(page).toHaveURL(`${stagingBaseURL}/download`);
    await expect(
      page.getByRole("heading", { name: "Download Violet before you start selling" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Download (Windows|macOS|Linux|Docker)/ }).first()).toBeVisible();
  } finally {
    await assertCleanup(page.context().request, account, registration, stagingBaseURL);
  }
});

test("paid registration reaches the configured hosted checkout without charging", async ({ page }) => {
  const account = disposableAccount("paid");
  let token: string | undefined;
  let registration: RegistrationResponse | undefined;
  let checkoutUrl: string | undefined;

  try {
    await page.goto("/register?plan=professional");
    registration = await register(page, account, "Continue to Professional checkout");
    token = registration.token;

    const checkoutResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/api/billing/checkout") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Continue to Professional checkout" }).click();
    const checkoutResponse = await checkoutResponsePromise;
    expect(checkoutResponse.status(), "staging checkout should be created").toBe(200);
    const checkout = (await checkoutResponse.json()) as { checkoutUrl?: string };
    checkoutUrl = checkout.checkoutUrl;
    expect(checkoutUrl, "the checkout service should return a hosted URL").toBeTruthy();
    expect(new URL(checkoutUrl!).origin).toBe(checkoutOrigin);

    await page.waitForURL((url) => url.origin === checkoutOrigin, { timeout: 60_000 });
    expect(new URL(page.url()).origin).toBe(checkoutOrigin);
  } finally {
    await assertCheckoutCancellation(
      page.context().request,
      account,
      token,
      stagingBaseURL,
      registrationTenantId(registration),
    );
    await assertCleanup(page.context().request, account, registration, stagingBaseURL);
  }
});

test("the seeded stable release exposes its expected asset", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "violet_auth",
      JSON.stringify({ token: "staging-release-check", user: null, tenant: null }),
    );
  });
  const releaseResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/api/releases/latest") &&
      new URL(response.url()).searchParams.get("channel") === "stable",
  );
  await page.goto("/download");
  const releaseResponse = await releaseResponsePromise;
  expect(releaseResponse.status(), "staging should expose a stable release").toBe(200);

  const release = (await releaseResponse.json()) as ReleaseResponse;
  expect(release.channel).toBe("stable");
  expect(release.version).toBe(expectedReleaseVersion);
  const asset = release.assets?.find(
    (candidate) =>
      candidate.platform === expectedAssetPlatform &&
      candidate.fileName === expectedAssetFileName,
  );
  expect(asset, "the seeded stable release should include the expected asset").toBeTruthy();
  expect(asset?.downloadUrl).toBeTruthy();

  const assetResponse = await page.context().request.get(
    new URL(asset!.downloadUrl!, stagingBaseURL).toString(),
  );
  expect(assetResponse.status(), "the expected release asset should be downloadable").toBe(200);
  expect(assetResponse.headers()["content-disposition"]).toContain(expectedAssetFileName);
});

test("an unpublished release channel returns the real unavailable response", async ({ request }) => {
  const response = await request.get(
    new URL(
      `/api/releases/latest?channel=${encodeURIComponent(noReleaseChannel)}`,
      stagingBaseURL,
    ).toString(),
  );
  expect(response.status(), "an unseeded channel should return not found").toBe(404);
  await expect(response.json()).resolves.toEqual({
    error: "No published release is available.",
  });
});