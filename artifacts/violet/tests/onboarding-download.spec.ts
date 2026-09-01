import { expect, test, type Page, type Route } from "@playwright/test";

const freeAuthResponse = {
  token: "free-session-token",
  user: {
    id: "free-user",
    email: "owner@free.example",
    firstName: "Free",
    lastName: "Owner",
    role: "owner",
    tenantId: "free-tenant",
    avatarUrl: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  tenant: {
    id: "free-tenant",
    name: "Free Market",
    email: "owner@free.example",
    status: "active",
    planId: "free-plan",
    planName: "Free",
    requiresBillingAction: false,
    billingMessage: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function fillRegistration(page: Page) {
  await page.getByLabel("Business Name").fill("Free Market");
  await page.getByLabel("First Name").fill("Free");
  await page.getByLabel("Last Name").fill("Owner");
  await page.getByLabel("Work Email").fill("owner@free.example");
  await page.getByLabel("Password").fill("correct-horse-battery");
}

async function mockRelease404(page: Page) {
  await page.route("**/api/releases/latest*", (route) =>
    fulfillJson(route, { error: "No published release is available." }, 404),
  );
}

async function assertPrimaryActionsFitViewport(page: Page) {
  const downloadLink = page.getByRole("link", { name: "Open browser POS for now" });
  const downloadButton = page.getByRole("button", { name: "Download coming soon" });

  await expect(downloadLink).toBeVisible();
  await expect(downloadButton).toBeDisabled();

  for (const locator of [downloadLink, downloadButton]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual((await page.evaluate(() => innerHeight)) + 1);
  }
}

test("free registration lands on the download page with a useful unavailable state", async ({ page }) => {
  await page.route("**/api/auth/register", (route) => fulfillJson(route, freeAuthResponse, 201));
  await mockRelease404(page);

  await page.goto("/register");
  await fillRegistration(page);
  await page.getByRole("button", { name: "Create free account" }).click();

  await expect(page).toHaveURL(/\/download$/);
  await expect(page.getByRole("heading", { name: "Download Violet before you start selling" })).toBeVisible();
  await expect(page.getByText("The first stable download is not published yet")).toBeVisible();
  await expect(
    page.getByText("Your account is ready. This page will show the download as soon as a stable Violet package is published."),
  ).toBeVisible();
  await assertPrimaryActionsFitViewport(page);
});

test("paid registration reaches secure checkout instead of the download page", async ({ page }) => {
  await page.route("**/api/auth/register", (route) => fulfillJson(route, freeAuthResponse, 201));
  await page.route("**/api/billing/checkout", (route) =>
    fulfillJson(route, { checkoutUrl: "https://checkout.violet.test/secure-checkout?plan=professional" }),
  );
  await page.route("https://checkout.violet.test/secure-checkout?plan=professional", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main><h1>Secure checkout</h1></main>",
    }),
  );

  await page.goto("/register?plan=professional");
  await fillRegistration(page);
  await page.getByRole("button", { name: "Continue to Professional checkout" }).click();

  await expect(page).toHaveURL("https://checkout.violet.test/secure-checkout?plan=professional");
  await expect(page.getByRole("heading", { name: "Secure checkout" })).toBeVisible();
});

test("existing login lands on the browser POS", async ({ page }) => {
  await page.route("**/api/auth/login", (route) =>
    fulfillJson(route, {
      ...freeAuthResponse,
      user: { ...freeAuthResponse.user, email: "existing@free.example" },
      tenant: { ...freeAuthResponse.tenant, email: "existing@free.example" },
    }),
  );
  await page.route("**/api/pos/products*", (route) => fulfillJson(route, { data: [], total: 0 }));
  await page.route("**/api/settings/pos-tax", (route) =>
    fulfillJson(route, { taxRate: 0, taxName: "Tax", currency: "USD" }),
  );

  await page.goto("/login");
  await page.getByLabel("Work Email").fill("existing@free.example");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByPlaceholder("Search products, SKU, barcode... (Press '/')")).toBeVisible();
});

test("published stable release exposes the preferred asset and keeps actions usable", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("violet_auth", JSON.stringify({ token: "session", user: null, tenant: null }));
  });
  await page.route("**/api/releases/latest*", (route) =>
    fulfillJson(route, {
      version: "1.8.0",
      channel: "stable",
      publishedAt: "2026-09-01T00:00:00.000Z",
      assets: [
        {
          platform: "linux",
          fileName: "violet-linux.tar.gz",
          sizeBytes: 5 * 1024 * 1024,
          downloadUrl: "/api/releases/release-1/assets/linux",
        },
        {
          platform: "windows",
          fileName: "violet-windows.exe",
          sizeBytes: 10 * 1024 * 1024,
          downloadUrl: "/api/releases/release-1/assets/windows",
        },
      ],
    }),
  );

  await page.goto("/download");

  const primaryDownload = page.getByRole("link", { name: "Download Windows" }).first();
  const expectedAssetUrl = new URL(
    "/api/releases/release-1/assets/windows",
    page.url(),
  ).toString();
  await expect(primaryDownload).toHaveAttribute(
    "href",
    expectedAssetUrl,
  );
  await expect(page.getByText("Stable release 1.8.0")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose your setup" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open browser POS for now" })).toBeVisible();
});