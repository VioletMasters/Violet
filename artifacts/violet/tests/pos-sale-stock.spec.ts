import { expect, test, type Page, type Route } from "@playwright/test";

const authState = {
  token: "pos-session-token",
  user: {
    id: "pos-user",
    email: "cashier@market.example",
    firstName: "POS",
    lastName: "Cashier",
    role: "owner",
    tenantId: "pos-tenant",
    avatarUrl: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  tenant: {
    id: "pos-tenant",
    name: "POS Market",
    email: "cashier@market.example",
    status: "active",
    planId: "professional-plan",
    planName: "Professional",
    requiresBillingAction: false,
    billingMessage: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
};

const product = {
  id: "product-1",
  name: "Test Widget",
  sku: "WIDGET-1",
  barcode: null,
  price: 12,
  imageUrl: null,
};

type PosApiState = {
  saleCompleted: boolean;
};

type SaleFailure = {
  status: number;
  body: unknown;
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installPosApi(
  page: Page,
  saleFailure: SaleFailure | null = null,
  state: PosApiState = { saleCompleted: false },
) {
  let productQueryCount = 0;
  const productSearches: string[] = [];
  let saleRequest: Record<string, unknown> | null = null;

  await page.addInitScript((state) => {
    localStorage.setItem("violet_auth", JSON.stringify(state));
  }, authState);

  await page.route("**/api/auth/me", (route) => fulfillJson(route, authState.user));
  await page.route("**/api/pos/products**", async (route) => {
    productQueryCount += 1;
    productSearches.push(new URL(route.request().url()).searchParams.get("search") ?? "");
    await fulfillJson(route, {
      data: [{ ...product, stock: state.saleCompleted ? 0 : 1 }],
      total: 1,
      page: 1,
      limit: 50,
    });
  });
  await page.route("**/api/settings/pos-tax", (route) =>
    fulfillJson(route, { taxRate: 0, taxName: "Tax", currency: "USD" }),
  );
  await page.route("**/api/register-shifts/current", (route) =>
    fulfillJson(route, {
      shift: {
        id: "shift-1",
        storeId: "store-1",
        registerId: "register-1",
        cashierId: "pos-user",
        openingCash: "100.00",
        openedAt: "2026-09-10T08:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/registers**", (route) =>
    fulfillJson(route, {
      data: [{ id: "register-1", name: "Front Register", code: "FRONT", storeId: "store-1", isActive: true }],
      total: 1,
    }),
  );
  await page.route("**/api/sales", async (route) => {
    saleRequest = route.request().postDataJSON() as Record<string, unknown>;
    if (saleFailure) {
      await fulfillJson(route, saleFailure.body, saleFailure.status);
      return;
    }
    state.saleCompleted = true;
    await fulfillJson(route, {
      id: "sale-1",
      receiptNumber: "RCP-1",
      totalAmount: 12,
      cashTendered: 12,
      paymentMethod: "cash",
      status: "completed",
    }, 201);
  });

  return {
    getProductQueryCount: () => productQueryCount,
    getProductSearches: () => productSearches,
    getSaleRequest: () => saleRequest,
  };
}

async function openPaymentDialog(page: Page) {
  await page.getByRole("button", { name: /Test Widget/ }).click();
  await page.getByRole("button", { name: "Charge JMD 12.00" }).click();
  await page.locator('input[type="number"]').fill("12");
}

test.describe("POS stock refresh after checkout", () => {
  test("refreshes product stock after the server confirms a sale", async ({ page }) => {
    const api = await installPosApi(page);

    await page.goto("/pos");
    await expect(page.getByRole("button", { name: /Test Widget/ })).toBeVisible();
    await expect(page.getByText("1 in stock")).toBeVisible();

    await openPaymentDialog(page);
    await page.getByRole("button", { name: "Complete Sale" }).click();

    await expect.poll(api.getProductQueryCount).toBeGreaterThan(1);
    await expect(page.getByText("0 in stock")).toBeVisible();
    await expect(page.getByText("Cart is empty. Select products to begin a sale.")).toBeVisible();
    expect(api.getSaleRequest()).toMatchObject({
      paymentMethod: "cash",
      shiftId: "shift-1",
      items: [{ productId: "product-1", quantity: 1, unitPrice: 12 }],
    });
  });

  test("refreshes stock for the active product search after a sale", async ({ page }) => {
    const api = await installPosApi(page);
    const searchInput = page.getByPlaceholder("Search products, SKU, barcode... (Press '/')");

    await page.goto("/pos");
    await searchInput.fill("Test Widget");
    await expect(page.getByRole("button", { name: /Test Widget/ })).toBeVisible();
    await expect(page.getByText("1 in stock")).toBeVisible();

    await openPaymentDialog(page);
    await page.getByRole("button", { name: "Complete Sale" }).click();

    await expect.poll(api.getProductQueryCount).toBeGreaterThan(1);
    await expect.poll(api.getProductSearches).toContain("Test Widget");
    await expect(searchInput).toHaveValue("Test Widget");
    await expect(page.getByRole("button", { name: /Test Widget/ })).toBeDisabled();
    await expect(page.getByText("0 in stock")).toBeVisible();
  });

  test("refreshes stock in another open POS session after a sale", async ({ browser }) => {
    const firstCashier = await browser.newPage();
    const secondCashier = await browser.newPage();
    const sharedState = { saleCompleted: false };
    const firstApi = await installPosApi(firstCashier, null, sharedState);
    const secondApi = await installPosApi(secondCashier, null, sharedState);

    await Promise.all([firstCashier.goto("/pos"), secondCashier.goto("/pos")]);
    await expect(firstCashier.getByRole("button", { name: /Test Widget/ })).toBeVisible();
    await expect(secondCashier.getByRole("button", { name: /Test Widget/ })).toBeVisible();
    await expect(firstCashier.getByText("1 in stock")).toBeVisible();
    await expect(secondCashier.getByText("1 in stock")).toBeVisible();

    await openPaymentDialog(firstCashier);
    await firstCashier.getByRole("button", { name: "Complete Sale" }).click();

    await expect.poll(firstApi.getProductQueryCount).toBeGreaterThan(1);
    await expect.poll(secondApi.getProductQueryCount, { timeout: 10_000 }).toBeGreaterThan(1);
    await expect(secondCashier.getByText("0 in stock")).toBeVisible();
  });

  test("keeps the cart and product data unchanged when checkout fails", async ({ page }) => {
    const api = await installPosApi(page, {
      status: 409,
      body: { error: "Sale could not be completed." },
    });

    await page.goto("/pos");
    await expect(page.getByRole("button", { name: /Test Widget/ })).toBeVisible();
    const initialProductQueryCount = api.getProductQueryCount();

    await openPaymentDialog(page);
    await page.getByRole("button", { name: "Complete Sale" }).click();

    await expect(page.getByRole("heading", { name: "Complete Payment" })).toBeVisible();
    await expect(page.getByText("1 items")).toBeVisible();
    await expect(page.getByText("1 in stock")).toBeVisible();
    expect(api.getProductQueryCount()).toBe(initialProductQueryCount);
    expect(api.getSaleRequest()).toMatchObject({
      paymentMethod: "cash",
      shiftId: "shift-1",
    });
  });

  test("identifies stale stock and lets the cashier fix only the affected cart item", async ({ page }) => {
    await installPosApi(page, {
      status: 409,
      body: {
        error: "Test Widget only has 0 in stock",
        code: "STOCK_CHANGED",
        productId: "product-1",
        productName: "Test Widget",
        requestedQuantity: 1,
        currentStock: 0,
      },
    });

    await page.goto("/pos");
    await openPaymentDialog(page);
    await page.getByRole("button", { name: "Complete Sale" }).click();

    await expect(page.getByRole("heading", { name: "Cart stock changed" })).toBeVisible();
    await expect(page.getByText(/Test Widget.*requested 1.*only 0 remain/)).toBeVisible();
    await page.getByRole("button", { name: "Remove item" }).click();

    await expect(page.getByRole("heading", { name: "Complete Payment" })).toBeHidden();
    await expect(page.getByText("Cart is empty. Select products to begin a sale.")).toBeVisible();
  });
});