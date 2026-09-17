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

const firstTenantAuth = {
  ...ownerAuth,
  token: "hosted-first-tenant-session",
  user: {
    ...ownerAuth.user,
    id: "first-tenant-owner",
    email: "first-owner@violet.test",
    tenantId: "first-tenant",
  },
  tenant: {
    ...ownerAuth.tenant,
    id: "first-tenant",
    name: "First Tenant",
    email: "first-owner@violet.test",
  },
};

const secondTenantAuth = {
  ...ownerAuth,
  token: "hosted-second-tenant-session",
  user: {
    ...ownerAuth.user,
    id: "second-tenant-owner",
    email: "second-owner@violet.test",
    tenantId: "second-tenant",
  },
  tenant: {
    ...ownerAuth.tenant,
    id: "second-tenant",
    name: "Second Tenant",
    email: "second-owner@violet.test",
  },
};

async function installAuthMocks(
  page: Page,
  auth: typeof superAdminAuth,
  options: { seedAuth?: boolean } = {},
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

  if (options.seedAuth !== false) {
    await page.addInitScript((authState: typeof superAdminAuth) => {
      localStorage.setItem("violet_auth", JSON.stringify(authState));
      if (authState.user.role !== "super_admin") {
        localStorage.setItem(
          `violet.starter-tutorial.v1.${authState.tenant.id}.${authState.user.id}`,
          JSON.stringify({ step: 2, completed: true }),
        );
      }
    }, auth);
  }
}

async function installTenantSwitchMocks(page: Page, options: { seedAuth?: boolean } = {}) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const token = route.request().headers().authorization?.replace(/^Bearer\s+/i, "");
    const auth = token === secondTenantAuth.token ? secondTenantAuth : firstTenantAuth;

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(auth),
      });
      return;
    }

    if (url.pathname === "/api/pos/products") {
      if (auth === secondTenantAuth) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{
            id: `${auth.tenant.id}-product`,
            name: `${auth.tenant.name} Product`,
            sku: `${auth.tenant.id}-sku`,
            price: 12.5,
            stock: 10,
          }],
          total: 1,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        url.pathname === "/api/settings/pos-tax"
          ? { taxRate: 0, taxName: "Tax", currency: "USD" }
          : url.pathname === "/api/register-shifts/current"
            ? { shift: null }
            : url.pathname === "/api/registers"
              ? { data: [] }
              : [],
      ),
    });
  });

  if (options.seedAuth !== false) {
    await page.addInitScript((authState: typeof firstTenantAuth) => {
      localStorage.setItem("violet_auth", JSON.stringify(authState));
    }, firstTenantAuth);
  }
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

test("logs out every open hosted Super Admin tab when one expires", async ({ page, context }) => {
  await installAuthMocks(page, superAdminAuth);
  await page.clock.install();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);

  const otherPage = await context.newPage();
  await installAuthMocks(otherPage, superAdminAuth);
  await otherPage.goto("/admin");
  await expect(otherPage).toHaveURL(/\/admin$/);

  await page.clock.fastForward(30 * 60 * 1000);

  await expect(page).toHaveURL(/\/login$/);
  await expect(otherPage).toHaveURL(/\/login$/);
  expect(await otherPage.evaluate(() => localStorage.getItem("violet_auth"))).toBeNull();

  await otherPage.close();
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

test("signs in an already-open login tab when another tab creates a session", async ({ page, context }) => {
  await installAuthMocks(page, ownerAuth, { seedAuth: false });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to Violet" })).toBeVisible();

  const otherPage = await context.newPage();
  await installAuthMocks(otherPage, ownerAuth);
  await otherPage.goto("/pos");

  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByText("Store Owner")).toBeVisible();

  await otherPage.close();
});

test("clears the previous tenant's POS data before the replacement tenant responds", async ({ page, context }) => {
  await installTenantSwitchMocks(page);
  await page.goto("/pos");
  await expect(page.getByText("First Tenant Product")).toBeVisible();

  const otherPage = await context.newPage();
  await installTenantSwitchMocks(otherPage, { seedAuth: false });
  await otherPage.goto("/login");
  await otherPage.evaluate((authState) => {
    localStorage.setItem("violet_auth", JSON.stringify(authState));
  }, secondTenantAuth);

  await page.waitForTimeout(100);
  expect(await page.getByText("First Tenant Product").count()).toBe(0);
  await expect(page.getByText("Second Tenant Product")).toBeVisible();
  await otherPage.close();
});

test("refreshes account and role changes without dropping same-session manager access", async ({ page, context }) => {
  await installAuthMocks(page, ownerAuth);
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "violet_manager_access",
      JSON.stringify({
        accessToken: "manager-access-for-owner-session",
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
    );
  });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Store Owner")).toBeVisible();

  const otherPage = await context.newPage();
  await installAuthMocks(otherPage, ownerAuth);
  await otherPage.goto("/pos");

  const updatedAuth = {
    ...ownerAuth,
    user: {
      ...ownerAuth.user,
      firstName: "Updated",
      role: "manager",
    },
    tenant: {
      ...ownerAuth.tenant,
      name: "Updated Store",
    },
  };
  await otherPage.evaluate((authState) => {
    localStorage.setItem("violet_auth", JSON.stringify(authState));
  }, updatedAuth);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Updated Store")).toBeVisible();
  await expect(page.getByText("Updated Owner")).toBeVisible();
  await expect(page.getByText("manager", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("violet_manager_access"))).not.toBeNull();

  await otherPage.close();
});

test("logs out non-Super-Admin tabs when the shared session is removed", async ({ page, context }) => {
  await installAuthMocks(page, ownerAuth);
  await page.goto("/pos");
  await expect(page).toHaveURL(/\/pos$/);

  const otherPage = await context.newPage();
  await installAuthMocks(otherPage, ownerAuth);
  await otherPage.goto("/pos");
  await expect(otherPage).toHaveURL(/\/pos$/);

  await page.getByTitle("Logout").click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(otherPage).toHaveURL(/\/login$/);
  await expect(otherPage.getByRole("heading", { name: "Sign in to Violet" })).toBeVisible();

  await otherPage.close();
});
