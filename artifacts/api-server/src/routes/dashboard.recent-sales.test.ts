import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, customersTable, saleItemsTable, salesTable, tenantsTable, usersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { getRecentSales } from "./dashboard";

const currentTenantId = randomUUID();
const otherTenantId = randomUUID();
const sameTenantCustomerId = randomUUID();
const otherTenantCustomerId = randomUUID();
const sameTenantCashierId = randomUUID();
const otherTenantCashierId = randomUUID();
const sameTenantSaleId = randomUUID();
const crossTenantSaleId = randomUUID();
const sameTenantProductId = randomUUID();
const crossTenantProductId = randomUUID();

async function main() {
  const createdAt = new Date(Date.now() + 60_000);

  try {
    await db.insert(tenantsTable).values([
      {
        id: currentTenantId,
        name: "Recent Sales Current Business",
        email: `${currentTenantId}@example.test`,
      },
      {
        id: otherTenantId,
        name: "Recent Sales Other Business",
        email: `${otherTenantId}@example.test`,
      },
    ]);

    await db.insert(customersTable).values([
      {
        id: sameTenantCustomerId,
        tenantId: currentTenantId,
        firstName: "Current",
        lastName: "Customer",
      },
      {
        id: otherTenantCustomerId,
        tenantId: otherTenantId,
        firstName: "Other",
        lastName: "Customer",
      },
    ]);

    await db.insert(usersTable).values([
      {
        id: sameTenantCashierId,
        tenantId: currentTenantId,
        email: `${sameTenantCashierId}@example.test`,
        passwordHash: "test-password-hash",
        firstName: "Current",
        lastName: "Cashier",
        role: "cashier",
      },
      {
        id: otherTenantCashierId,
        tenantId: otherTenantId,
        email: `${otherTenantCashierId}@example.test`,
        passwordHash: "test-password-hash",
        firstName: "Other",
        lastName: "Cashier",
        role: "cashier",
      },
    ]);

    await db.insert(salesTable).values([
      {
        id: sameTenantSaleId,
        tenantId: currentTenantId,
        receiptNumber: "RECENT-SAME-TENANT",
        customerId: sameTenantCustomerId,
        cashierId: sameTenantCashierId,
        subtotal: "12.00",
        taxAmount: "0.00",
        discountAmount: "0.00",
        totalAmount: "12.00",
        paymentMethod: "card",
        status: "completed",
        createdAt,
      },
      {
        id: crossTenantSaleId,
        tenantId: currentTenantId,
        receiptNumber: "RECENT-CROSS-TENANT",
        customerId: otherTenantCustomerId,
        cashierId: otherTenantCashierId,
        subtotal: "8.00",
        taxAmount: "0.00",
        discountAmount: "0.00",
        totalAmount: "8.00",
        paymentMethod: "card",
        status: "completed",
        createdAt: new Date(createdAt.getTime() - 1_000),
      },
    ]);

    await db.insert(saleItemsTable).values([
      {
        id: randomUUID(),
        saleId: sameTenantSaleId,
        productId: sameTenantProductId,
        productName: "Current Product",
        quantity: 2,
        unitPrice: "6.00",
        discount: "0.00",
        totalPrice: "12.00",
      },
      {
        id: randomUUID(),
        saleId: crossTenantSaleId,
        productId: crossTenantProductId,
        productName: "Cross-Tenant Sale Product",
        quantity: 1,
        unitPrice: "8.00",
        discount: "0.00",
        totalPrice: "8.00",
      },
    ]);

    const result = await getRecentSales(currentTenantId);

    assert.deepEqual(
      result.map((sale) => sale.id),
      [sameTenantSaleId, crossTenantSaleId],
      "recent sales must retain newest-first ordering",
    );
    assert.deepEqual(
      result.map((sale) => ({
        customerName: sale.customerName,
        cashierName: sale.cashierName,
      })),
      [
        { customerName: "Current Customer", cashierName: "Current Cashier" },
        { customerName: null, cashierName: "" },
      ],
      "cross-tenant customer and cashier rows must not provide names",
    );
    assert.deepEqual(
      result.map((sale) => sale.items),
      [
        [
          {
            productId: sameTenantProductId,
            productName: "Current Product",
            quantity: 2,
            unitPrice: 6,
            discount: 0,
            totalPrice: 12,
          },
        ],
        [
          {
            productId: crossTenantProductId,
            productName: "Cross-Tenant Sale Product",
            quantity: 1,
            unitPrice: 8,
            discount: 0,
            totalPrice: 8,
          },
        ],
      ],
      "tenant-scoped name joins must not change sale item contents",
    );

    console.log("Dashboard recent-sales tenant isolation verification passed.");
  } finally {
    await db.delete(saleItemsTable).where(inArray(saleItemsTable.saleId, [sameTenantSaleId, crossTenantSaleId]));
    await db.delete(salesTable).where(inArray(salesTable.id, [sameTenantSaleId, crossTenantSaleId]));
    await db.delete(customersTable).where(inArray(customersTable.id, [sameTenantCustomerId, otherTenantCustomerId]));
    await db.delete(usersTable).where(inArray(usersTable.id, [sameTenantCashierId, otherTenantCashierId]));
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