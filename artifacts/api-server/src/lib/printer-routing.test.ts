import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { printJobsTable } from "@workspace/db";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildSalePrintJobPlan,
  createSalePrintJobs,
  preparePrintJobRetry,
  printJobRetryPredicate,
  printerRoleForDocumentType,
  resolvePrintDestination,
  selectPrinterForSale,
} from "./printer-routing";

function printer(overrides: Partial<{
  id: string;
  storeId: string | null;
  registerId: string | null;
  deviceName: string;
  role: string;
  isDefault: number;
  isActive: number;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? randomUUID(),
    tenantId: randomUUID(),
    storeId: overrides.storeId ?? null,
    registerId: overrides.registerId ?? null,
    name: "Test printer",
    role: overrides.role ?? "customer_receipt",
    connectionType: "os",
    deviceName: overrides.deviceName ?? "test-device",
    deviceAddress: null,
    platform: null,
    isActive: overrides.isActive ?? 1,
    isDefault: overrides.isDefault ?? 0,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as never;
}

const storeId = randomUUID();
const registerId = randomUUID();
const globalPrinter = printer({ id: "global", isDefault: 1 });
const storePrinter = printer({ id: "store", storeId });
const registerPrinter = printer({ id: "register", storeId, registerId });

assert.equal(
  selectPrinterForSale([globalPrinter, storePrinter, registerPrinter], storeId, registerId)?.id,
  "register",
  "register-scoped printer must win over store and global printers",
);
assert.equal(
  selectPrinterForSale([globalPrinter, storePrinter, registerPrinter], storeId, null)?.id,
  "store",
  "store-scoped printer must win when there is no register scope",
);
assert.equal(
  selectPrinterForSale([globalPrinter, storePrinter], null, null)?.id,
  "global",
  "global printer must be selected for an unscoped sale",
);
assert.equal(
  selectPrinterForSale([printer({ id: "inactive", isActive: 0 }), globalPrinter], null, null)?.id,
  "global",
  "inactive printers must never be selected",
);

const retryableJob = {
  id: "job-1",
  tenantId: "tenant-1",
  status: "failed",
  documentType: "customer_receipt",
  payload: JSON.stringify({ receiptNumber: "RCP-1", printerName: "Old printer" }),
  printerId: "old-printer",
  retryCount: 2,
  errorMessage: "Printer unavailable",
} as const;
const replacementPrinter = printer({
  id: "replacement-printer",
  deviceName: "Windows Receipt Printer",
});
const retryPlanForSwitchedPrinter = preparePrintJobRetry(retryableJob, replacementPrinter as never);
assert.equal(retryPlanForSwitchedPrinter.ok, true, "failed job should be retryable with an active replacement printer");
if (retryPlanForSwitchedPrinter.ok) {
  assert.equal(retryPlanForSwitchedPrinter.printerId, "replacement-printer");
  assert.equal(retryPlanForSwitchedPrinter.retryCount, 3);
  assert.deepEqual(
    JSON.parse(retryPlanForSwitchedPrinter.payload),
    { receiptNumber: "RCP-1", printerName: "Windows Receipt Printer" },
    "retry must retain receipt data and direct it to the newly selected device",
  );
}
assert.equal(
  printerRoleForDocumentType("warehouse_ticket"),
  "warehouse",
  "operational tickets must resolve to the role used when the sale was created",
);
assert.equal(printerRoleForDocumentType("unknown_document"), null);
const noPrinterRetry = preparePrintJobRetry(retryableJob, null);
assert.equal(noPrinterRetry.ok, false);
if (!noPrinterRetry.ok) {
  assert.equal(noPrinterRetry.code, "no_printer");
  assert.match(noPrinterRetry.message, /No active printer/);
}
const alreadyQueuedRetry = preparePrintJobRetry(
  { ...retryableJob, status: "queued" },
  replacementPrinter as never,
);
assert.equal(alreadyQueuedRetry.ok, false, "queued jobs cannot be dispatched by concurrent retries");
if (!alreadyQueuedRetry.ok) assert.equal(alreadyQueuedRetry.code, "not_retryable");
const invalidPayloadRetry = preparePrintJobRetry(
  { ...retryableJob, payload: "{not-json" },
  replacementPrinter as never,
);
assert.equal(invalidPayloadRetry.ok, false, "legacy malformed payloads must not crash retry handling");
if (!invalidPayloadRetry.ok) {
  assert.equal(invalidPayloadRetry.code, "invalid_payload");
  assert.match(invalidPayloadRetry.message, /invalid saved document data/);
}
const tenantScopedRetryWhere = new PgDialect().sqlToQuery(
  printJobRetryPredicate("tenant-1", "job-1"),
);
assert.deepEqual(
  tenantScopedRetryWhere.params,
  ["job-1", "tenant-1"],
  "retry lookup must include both the job id and authenticated tenant id",
);
assert.match(tenantScopedRetryWhere.sql, /"tenant_id"/);

const categoryDestinations = new Map([["bakery", "warehouse"]]);
assert.equal(
  resolvePrintDestination("kitchen", "bakery", categoryDestinations),
  "kitchen",
  "a product destination must override its category destination",
);
assert.equal(
  resolvePrintDestination("customer_receipt", "bakery", categoryDestinations),
  "warehouse",
  "category destination must be used when the product keeps the receipt default",
);

const sale = {
  id: randomUUID(),
  tenantId: randomUUID(),
  receiptNumber: "TEST-100",
  storeId,
  registerId,
  cashierId: randomUUID(),
  totalAmount: "12.00",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const lines = [{
  product: {
    id: randomUUID(),
    name: "Test item",
    sku: "TEST-ITEM",
    categoryId: "bakery",
    printDestination: "warehouse",
    warehouseLocation: "A-1",
  },
  quantity: 1,
  unitPrice: 12,
  totalPrice: 12,
}];

const missingPrinterPlan = await buildSalePrintJobPlan(
  sale,
  lines,
  categoryDestinations,
  async () => null,
);
assert.equal(missingPrinterPlan.jobs[0].status, "failed", "a missing receipt printer must fail only the print job");
assert.match(
  missingPrinterPlan.jobs[0].errorMessage ?? "",
  /No active customer receipt printer/,
  "missing printer jobs must explain the recoverable failure",
);
assert.equal(missingPrinterPlan.jobs[1].status, "failed", "a missing routed printer must not fail the sale plan");
assert.deepEqual(
  missingPrinterPlan.jobs.map((job) => job.idempotencyKey),
  [`sale:${sale.id}:customer_receipt`, `sale:${sale.id}:warehouse`],
  "each sale print job must have a stable idempotency key",
);

const retryPlan = await buildSalePrintJobPlan(sale, lines, categoryDestinations, async (role) => (
  role === "customer_receipt" ? globalPrinter : null
));
assert.deepEqual(
  retryPlan.jobs.map((job) => job.idempotencyKey),
  missingPrinterPlan.jobs.map((job) => job.idempotencyKey),
  "replaying an idempotent checkout must target the same print jobs",
);
assert.equal(retryPlan.jobs[0].status, "queued", "a later retry may queue a previously missing receipt printer");

const persistedJobs = new Map<string, unknown>();
const fakeTransaction = {
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: async () => [],
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: unknown) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          if (table !== printJobsTable) return [];
          const jobs = values as Array<{ idempotencyKey?: string | null }>;
          const inserted = jobs.filter((job) => {
            const key = job.idempotencyKey ?? "";
            if (persistedJobs.has(key)) return false;
            persistedJobs.set(key, job);
            return true;
          });
          return inserted;
        },
      }),
    }),
  }),
} as never;

const completedSale = { ...sale, status: "completed" };
const firstInsert = await createSalePrintJobs(
  fakeTransaction,
  completedSale,
  lines,
  categoryDestinations,
);
const secondInsert = await createSalePrintJobs(
  fakeTransaction,
  completedSale,
  lines,
  categoryDestinations,
);
assert.equal(firstInsert.length, 2, "checkout must queue receipt and routed print jobs");
assert.equal(secondInsert.length, 0, "idempotent checkout must not duplicate print jobs");
assert.equal(completedSale.status, "completed", "print outcomes must not alter the completed sale");

console.log("Printer routing and sale print-job verification passed.");