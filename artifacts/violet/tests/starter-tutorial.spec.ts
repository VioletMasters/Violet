import { expect, test, type Page } from "@playwright/test";

const ownerAuth = {
  token: "starter-tutorial-owner-session",
  user: {
    id: "starter-tutorial-owner",
    email: "owner@starter-tutorial.violet.test",
    firstName: "Starter",
    lastName: "Owner",
    role: "owner",
    tenantId: "starter-tutorial-tenant",
    avatarUrl: null,
    mustChangePassword: false,
    emailVerifiedAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  tenant: {
    id: "starter-tutorial-tenant",
    name: "Starter Tutorial Store",
    email: "owner@starter-tutorial.violet.test",
    status: "active",
    planId: "professional-plan",
    planName: "Professional",
    requiresBillingAction: false,
    billingMessage: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
};

const tutorialStorageKey =
  "violet.starter-tutorial.v1.starter-tutorial-tenant.starter-tutorial-owner";

async function installStarterTutorialMocks(
  page: Page,
  options: {
    managerAccess?: boolean;
    productCreateStatus?: number;
    cashierDayStartStatus?: number;
  } = {},
) {
  const {
    managerAccess = false,
    productCreateStatus = 201,
    cashierDayStartStatus = 201,
  } = options;
  let cashierDayStarted = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ownerAuth),
      });
      return;
    }

    if (url.pathname === "/api/products" && route.request().method() === "POST") {
      if (productCreateStatus >= 400) {
        await route.fulfill({
          status: productCreateStatus,
          contentType: "application/json",
          body: JSON.stringify({ error: "Product creation failed" }),
        });
        return;
      }

      await route.fulfill({
        status: productCreateStatus,
        contentType: "application/json",
        body: JSON.stringify({
          id: "starter-tutorial-product",
          name: "Starter Coffee",
          sku: "STARTER-001",
          price: 12.5,
          costPrice: 5,
          stock: 10,
          minStock: 5,
          categoryId: null,
          brandId: null,
          imageUrl: null,
          printDestination: "customer_receipt",
          warehouseLocation: null,
          tenantId: ownerAuth.tenant.id,
          isActive: true,
          createdAt: "2026-09-17T00:00:00.000Z",
        }),
      });
      return;
    }

    if (url.pathname === "/api/register-shifts/open" && route.request().method() === "POST") {
      if (cashierDayStartStatus >= 400) {
        await route.fulfill({
          status: cashierDayStartStatus,
          contentType: "application/json",
          body: JSON.stringify({ error: "Cashier day start failed" }),
        });
        return;
      }

      cashierDayStarted = true;
      await route.fulfill({
        status: cashierDayStartStatus,
        contentType: "application/json",
        body: JSON.stringify({
          id: "starter-tutorial-shift",
          storeId: "starter-tutorial-store",
          registerId: "starter-tutorial-register",
          cashierId: ownerAuth.user.id,
          openingCash: "100.00",
          status: "open",
          openedAt: "2026-09-17T09:00:00.000Z",
        }),
      });
      return;
    }

    let body: unknown = [];
    if (url.pathname === "/api/register-shifts/current") {
      body = {
        shift: cashierDayStarted
          ? {
              id: "starter-tutorial-shift",
              storeId: "starter-tutorial-store",
              registerId: "starter-tutorial-register",
              cashierId: ownerAuth.user.id,
              openingCash: "100.00",
              status: "open",
              openedAt: "2026-09-17T09:00:00.000Z",
            }
          : null,
        occupiedRegisterIds: cashierDayStarted ? ["starter-tutorial-register"] : [],
      };
    } else if (url.pathname === "/api/pos/products") {
      body = { data: [], total: 0 };
    } else if (url.pathname === "/api/settings/pos-tax") {
      body = { taxRate: 0, taxName: "Tax", currency: "USD" };
    } else if (url.pathname === "/api/registers") {
      body = {
        data: [
          {
            id: "starter-tutorial-register",
            name: "Front Register",
            code: "REG-1",
            storeId: "starter-tutorial-store",
            isActive: true,
          },
        ],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.addInitScript(({ authState, managerAccess }) => {
    localStorage.setItem("violet_auth", JSON.stringify(authState));
    localStorage.removeItem(
      "violet.starter-tutorial.v1.starter-tutorial-tenant.starter-tutorial-owner",
    );
    if (managerAccess) {
      sessionStorage.setItem(
        "violet_manager_access",
        JSON.stringify({
          accessToken: "starter-tutorial-manager-access",
          expiresAt: "2099-09-17T00:00:00.000Z",
        }),
      );
    } else {
      sessionStorage.removeItem("violet_manager_access");
    }
  }, { authState: ownerAuth, managerAccess });
}

async function openStarterGuide(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Starter guide" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function savedTutorialProgress(page: Page) {
  return page.evaluate((key) => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  }, tutorialStorageKey);
}

test("covers the fresh starter guide journey, access gates, and scoped persistence", async ({ page }) => {
  await installStarterTutorialMocks(page);
  await page.goto("/pos");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Create your first product" })).toBeVisible();
  await expect(dialog.getByTestId("text-tutorial-progress")).toHaveText("1 of 3 · Your first shift");
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 0, completed: false });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 0, completed: false });
  expect(await page.evaluate(() => Object.keys(localStorage))).toContain(tutorialStorageKey);

  await openStarterGuide(page);
  await dialog.getByTestId("button-tutorial-step-2").click();
  await expect(dialog.getByRole("heading", { name: "Start and cash out a cashier day" })).toBeVisible();
  await expect(dialog.getByTestId("text-settlement-account-menu-note")).toBeVisible();
  await dialog.getByTestId("button-tutorial-step-3").click();
  await expect(dialog.getByRole("heading", { name: "Review reports with confidence" })).toBeVisible();

  await dialog.getByTestId("button-tutorial-step-1").click();
  await dialog.getByTestId("button-tutorial-primary").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 0, completed: false });
  await expect(page.getByText("Manager access required")).toBeVisible();

  await openStarterGuide(page);
  await dialog.getByTestId("button-tutorial-step-2").click();
  await dialog.getByTestId("button-tutorial-primary").click();
  await expect(page).toHaveURL(/\/pos$/);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Current Sale" })).toBeVisible();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 2, completed: false });

  await openStarterGuide(page);
  await dialog.getByTestId("button-tutorial-step-3").click();
  await dialog.getByTestId("button-tutorial-primary").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 2, completed: false });

  await openStarterGuide(page);
  await dialog.getByTestId("button-tutorial-step-3").click();
  await dialog.getByTestId("button-tutorial-next").click();
  await expect(dialog).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 2, completed: true });

  await openStarterGuide(page);
  await expect(dialog.getByRole("heading", { name: "Review reports with confidence" })).toBeVisible();
  await expect(dialog.getByTestId("text-tutorial-progress")).toHaveText("3 of 3 · Your first shift");
});

test("reopens the guide on cashier day after a real product create succeeds", async ({ page }) => {
  await installStarterTutorialMocks(page, { managerAccess: true });
  await page.goto("/pos");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Create your first product" })).toBeVisible();
  await dialog.getByTestId("button-tutorial-primary").click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Add Product" }).click();
  await expect(page.getByRole("heading", { name: "New Product" })).toBeVisible();
  await page.locator('input[name="name"]').fill("Starter Coffee");
  await page.locator('input[name="sku"]').fill("STARTER-001");
  await page.locator('input[name="price"]').fill("12.50");
  await page.locator('input[name="stock"]').fill("10");

  const createRequest = page.waitForRequest(
    (request) => request.url().endsWith("/api/products") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Create Product" }).click();
  const request = await createRequest;
  expect(JSON.parse(request.postData() ?? "{}")).toMatchObject({
    name: "Starter Coffee",
    sku: "STARTER-001",
    price: 12.5,
    stock: 10,
  });

  await expect(dialog.getByRole("heading", { name: "Start and cash out a cashier day" })).toBeVisible();
  await expect(dialog.getByTestId("text-tutorial-progress")).toHaveText("2 of 3 · Your first shift");
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 1, completed: false });
});

test("reopens the guide on reports after a real cashier day start succeeds", async ({ page }) => {
  await installStarterTutorialMocks(page);
  await page.goto("/pos");

  const tutorial = page.getByRole("dialog");
  await tutorial.getByTestId("button-tutorial-step-2").click();
  await expect(tutorial.getByRole("heading", { name: "Start and cash out a cashier day" })).toBeVisible();
  await tutorial.getByTestId("button-tutorial-primary").click();
  await expect(page).toHaveURL(/\/pos$/);
  await expect(tutorial).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 2, completed: false });

  await page.getByRole("button", { name: "Start day" }).click();
  const shiftDialog = page.getByRole("dialog");
  await expect(shiftDialog.getByRole("heading", { name: "Start cashier day" })).toBeVisible();
  await shiftDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Front Register (REG-1)" }).click();
  await shiftDialog.locator("#opening-float").fill("100");

  const openShiftRequest = page.waitForRequest(
    (request) => request.url().endsWith("/api/register-shifts/open") && request.method() === "POST",
  );
  const openShiftResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/register-shifts/open") && response.request().method() === "POST",
  );
  await shiftDialog.getByRole("button", { name: "Start day" }).click();
  const request = await openShiftRequest;
  expect(JSON.parse(request.postData() ?? "{}")).toEqual({
    registerId: "starter-tutorial-register",
    openingCash: 100,
  });
  expect((await openShiftResponse).status()).toBe(201);

  await expect(page.getByRole("heading", { name: "Review reports with confidence" })).toBeVisible();
  await expect(page.getByTestId("text-tutorial-progress")).toHaveText("3 of 3 · Your first shift");
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 2, completed: false });
});

test("keeps the guide closed and progress unchanged when cashier day start fails", async ({ page }) => {
  await installStarterTutorialMocks(page, { cashierDayStartStatus: 500 });
  await page.goto("/pos");

  const tutorial = page.getByRole("dialog");
  await tutorial.getByTestId("button-tutorial-step-2").click();
  await tutorial.getByTestId("button-tutorial-primary").click();
  await expect(page).toHaveURL(/\/pos$/);
  await expect(tutorial).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 2, completed: false });

  await page.getByRole("button", { name: "Start day" }).click();
  const shiftDialog = page.getByRole("dialog");
  await shiftDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Front Register (REG-1)" }).click();
  await shiftDialog.locator("#opening-float").fill("100");

  const openShiftResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/register-shifts/open") && response.request().method() === "POST",
  );
  await shiftDialog.getByRole("button", { name: "Start day" }).click();
  expect((await openShiftResponse).status()).toBe(500);

  await expect(page.getByRole("heading", { name: "Review reports with confidence" })).toBeHidden();
  await expect(page.getByTestId("text-tutorial-progress")).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 2, completed: false });
  await expect(page.getByRole("heading", { name: "Start cashier day" })).toBeVisible();
});

test("keeps the guide closed and progress unchanged when product creation fails", async ({ page }) => {
  await installStarterTutorialMocks(page, { managerAccess: true, productCreateStatus: 500 });
  await page.goto("/pos");

  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("button-tutorial-primary").click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(dialog).toBeHidden();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 1, completed: false });

  await page.getByRole("button", { name: "Add Product" }).click();
  await page.locator('input[name="name"]').fill("Starter Coffee");
  await page.locator('input[name="sku"]').fill("STARTER-001");
  await page.locator('input[name="price"]').fill("12.50");

  const createResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/products") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create Product" }).click();
  expect((await createResponse).status()).toBe(500);

  await expect(page.getByTestId("text-tutorial-progress")).toBeHidden();
  await expect(page.getByRole("heading", { name: "New Product" })).toBeVisible();
  await expect(savedTutorialProgress(page)).resolves.toEqual({ step: 1, completed: false });
});