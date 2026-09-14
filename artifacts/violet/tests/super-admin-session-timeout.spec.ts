import { expect, test, type Page } from "@playwright/test";

const superAdminAuth = {
  token: "hosted-super-admin-session",
  user: {
    id: "super-admin-user",
    email: "admin@violet.test",
    firstName: "Super",
    lastName: "Admin",
    role: "super_admin",
    tenantId: "platform-tenant",
    avatarUrl: null,
    mustChangePassword: false,
    emailVerifiedAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  tenant: {
    id: "platform-tenant",
    name: "Violet Platform",
    email: "admin@violet.test",
    status: "active",
    planId: "enterprise-plan",
    planName: "Enterprise",
    requiresBillingAction: false,
    billingMessage: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
};

const ownerAuth = {
  ...superAdminAuth,
  token: "hosted-owner-session",
  user: {
    ...superAdminAuth.user,
    id: "owner-user",
    email: "owner@violet.test",
    firstName: "Store",
    lastName: "Owner",
    role: "owner",
    tenantId: "store-tenant",
  },
  tenant: {
    ...superAdminAuth.tenant,
    id: "store-tenant",
    name: "Store",
    email: "owner@violet.test",
    planId: "professional-plan",
    planName: "Professional",
  },
};

async function installAuthMocks(
  page: Page,
  auth: typeof superAdminAuth,
) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(auth),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        url.pathname === "/api/register-shifts/current"
          ? { shift: null }
          : url.pathname === "/api/admin/stats"
            ? {}
            : [],
      ),
    });
  });

  await page.addInitScript((authState: typeof superAdminAuth) => {
    localStorage.setItem("violet_auth", JSON.stringify(authState));
  }, auth);
}

test("logs out an idle hosted Super Admin after 30 minutes", async ({ page }) => {
  await installAuthMocks(page, superAdminAuth);
  await page.clock.install();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.clock.fastForward(30 * 60 * 1000);

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to Violet" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("violet_auth"))).toBeNull();
});

test("activity resets the hosted Super Admin idle timer", async ({ page }) => {
  await installAuthMocks(page, superAdminAuth);
  await page.clock.install();
  await page.goto("/admin");
  await page.clock.fastForward(29 * 60 * 1000);
  await page.evaluate(() => window.dispatchEvent(new Event("pointerdown")));
  await page.clock.fastForward(2 * 60 * 1000);
  await expect(page).toHaveURL(/\/admin$/);
  expect(await page.evaluate(() => localStorage.getItem("violet_auth"))).not.toBeNull();
});

test("does not apply the Super Admin idle timer to an owner session", async ({ page }) => {
  await installAuthMocks(page, ownerAuth);
  await page.clock.install();
  await page.goto("/pos");
  await page.clock.fastForward(31 * 60 * 1000);
  await expect(page).toHaveURL(/\/pos$/);
  expect(await page.evaluate(() => localStorage.getItem("violet_auth"))).not.toBeNull();
});