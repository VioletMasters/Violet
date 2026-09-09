import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  db,
  pool,
  customersTable,
  productsTable,
  saleItemsTable,
  salesTable,
  tenantsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { getDashboardStats, getSalesTrend, getTopProducts } from "./dashboard";

const currentTenantId = randomUUID();
const otherTenantId = randomUUID();
const currentProductId = randomUUID();
const currentSecondaryProductId = randomUUID();
const otherProductId = randomUUID();
const currentSaleId = randomUUID();
const currentSecondSaleId = randomUUID();
const otherSaleId = randomUUID();
const currentSaleItemId = randomUUID();
const currentSecondSaleItemId = randomUUID();
const currentSecondarySaleItemId = randomUUID();
const otherSaleItemId = randomUUID();
const currentCustomerId = randomUUID();
const currentSecondCustomerId = randomUUID();
const otherCustomerId = randomUUID();

async function main() {
  const now = new Date(Date.now() + 60_000);
  const currentDate = now.toISOString().slice(0, 10);

  try {
    await db.insert(tenantsTable).values([
      {
        id: currentTenantId,
        name: "Dashboard Current Business",
        email: `${currentTenantId}@example.test`,
      },
      {
        id: otherTenantId,
        name: "Dashboard Other Business",
        email: `${otherTenantId}@example.test`,
      },
    ]);

    await db.insert(customersTable).values([
      {
        id: currentCustomerId,
        tenantId: currentTenantId,
        firstName: "Current",
        lastName: "Customer",
      },
      {
        id: currentSecondCustomerId,
        tenantId: currentTenantId,
        firstName: "Current",
        lastName: "Second Customer",
      },
      {
        id: otherCustomerId,
        tenantId: otherTenantId,
        firstName: "Other",
        lastName: "Customer",
      },
    ]);

    await db.insert(productsTable).values([
      {
        id: currentProductId,
        tenantId: currentTenantId,
        name: "Current Product",
        sku: `DASH-CURRENT-${currentProductId}`,
        price: "10.00",
        costPrice: "3.00",
        stock: 4,
        minStock: 5,
      },
      {
        id: currentSecondaryProductId,
        tenantId: currentTenantId,
        name: "Current Secondary Product",
        sku: `DASH-SECONDARY-${currentSecondaryProductId}`,
        price: "20.00",
        costPrice: "8.00",
        stock: 10,
        minStock: 5,
      },
      {
        id: otherProductId,
        tenantId: otherTenantId,
        name: "Other Product",
        sku: `DASH-OTHER-${otherProductId}`,
        price: "99.00",
        costPrice: "40.00",
        stock: 20,
        minStock: 5,
      },
    ]);

    await db.insert(salesTable).values([
      {
        id: currentSaleId,
        tenantId: currentTenantId,
        receiptNumber: "DASH-CURRENT-1",
        customerId: currentCustomerId,
        cashierId: randomUUID(),
        subtotal: "30.00",
        taxAmount: "0.00",
        discountAmount: "0.00",
        totalAmount: "30.00",
        paymentMethod: "card",
        status: "completed",
        createdAt: now,
      },
      {
        id: currentSecondSaleId,
        tenantId: currentTenantId,
        receiptNumber: "DASH-CURRENT-2",
        customerId: currentSecondCustomerId,
        cashierId: randomUUID(),
        subtotal: "20.00",
        taxAmount: "0.00",
        discountAmount: "0.00",
        totalAmount: "20.00",
        paymentMethod: "card",
        status: "completed",
        createdAt: now,
      },
      {
        id: otherSaleId,
        tenantId: otherTenantId,
        receiptNumber: "DASH-OTHER-1",
        customerId: otherCustomerId,
        cashierId: randomUUID(),
        subtotal: "990.00",
        taxAmount: "0.00",
        discountAmount: "0.00",
        totalAmount: "990.00",
        paymentMethod: "card",
        status: "completed",
        createdAt: now,
      },
    ]);

    await db.insert(saleItemsTable).values([
      {
        id: currentSaleItemId,
        saleId: currentSaleId,
        productId: currentProductId,
        productName: "Current Product",
        quantity: 2,
        unitPrice: "10.00",
        discount: "0.00",
        totalPrice: "20.00",
      },
      {
        id: currentSecondSaleItemId,
        saleId: currentSecondSaleId,
        productId: currentProductId,
        productName: "Current Product",
        quantity: 1,
        unitPrice: "10.00",
        discount: "0.00",
        totalPrice: "10.00",
      },
      {
        id: currentSecondarySaleItemId,
        saleId: currentSaleId,
        productId: currentSecondaryProductId,
        productName: "Current Secondary Product",
        quantity: 1,
        unitPrice: "20.00",
        discount: "0.00",
        totalPrice: "20.00",
      },
      {
        id: otherSaleItemId,
        saleId: otherSaleId,
        productId: otherProductId,
        productName: "Other Product",
        quantity: 99,
        unitPrice: "10.00",
        discount: "0.00",
        totalPrice: "990.00",
      },
    ]);

    const stats = await getDashboardStats(currentTenantId, now);
    assert.deepEqual(
      {
        todayRevenue: stats.todayRevenue,
        weekRevenue: stats.weekRevenue,
        monthRevenue: stats.monthRevenue,
        totalProducts: stats.totalProducts,
        totalCustomers: stats.totalCustomers,
        lowStockCount: stats.lowStockCount,
        totalSalesToday: stats.totalSalesToday,
        inventoryCostValue: stats.inventoryCostValue,
        inventoryRetailValue: stats.inventoryRetailValue,
        inventoryMissingCostCount: stats.inventoryMissingCostCount,
      },
      {
        todayRevenue: 50,
        weekRevenue: 50,
        monthRevenue: 50,
        totalProducts: 2,
        totalCustomers: 2,
        lowStockCount: 1,
        totalSalesToday: 2,
        inventoryCostValue: 92,
        inventoryRetailValue: 240,
        inventoryMissingCostCount: 0,
      },
      "dashboard stats must only aggregate the signed-in business",
    );

    const topProducts = await getTopProducts(currentTenantId, now);
    assert.deepEqual(
      topProducts.map(({ productId, name, totalSold, totalRevenue }) => ({
        productId,
        name,
        totalSold,
        totalRevenue,
      })),
      [
        {
          productId: currentProductId,
          name: "Current Product",
          totalSold: 3,
          totalRevenue: 30,
        },
        {
          productId: currentSecondaryProductId,
          name: "Current Secondary Product",
          totalSold: 1,
          totalRevenue: 20,
        },
      ],
      "top products must preserve tenant-scoped aggregation and quantity ordering",
    );

    const salesTrend = await getSalesTrend(currentTenantId, now);
    assert.deepEqual(
      salesTrend,
      [{ date: currentDate, revenue: 50, count: 2 }],
      "sales trend must aggregate only the signed-in business",
    );

    console.log("Dashboard aggregate tenant isolation verification passed.");
  } finally {
    await db.delete(saleItemsTable).where(inArray(saleItemsTable.id, [
      currentSaleItemId,
      currentSecondSaleItemId,
      currentSecondarySaleItemId,
      otherSaleItemId,
    ]));
    await db.delete(salesTable).where(inArray(salesTable.id, [currentSaleId, currentSecondSaleId, otherSaleId]));
    await db.delete(productsTable).where(inArray(productsTable.id, [
      currentProductId,
      currentSecondaryProductId,
      otherProductId,
    ]));
    await db.delete(customersTable).where(inArray(customersTable.id, [
      currentCustomerId,
      currentSecondCustomerId,
      otherCustomerId,
    ]));
    await db.delete(tenantsTable).where(and(
      eq(tenantsTable.id, currentTenantId),
      eq(tenantsTable.email, `${currentTenantId}@example.test`),
    ));
    await db.delete(tenantsTable).where(and(
      eq(tenantsTable.id, otherTenantId),
      eq(tenantsTable.email, `${otherTenantId}@example.test`),
    ));
  }
}

await main();
await pool.end();