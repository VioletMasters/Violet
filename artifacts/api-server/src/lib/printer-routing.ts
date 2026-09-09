import {
  categoriesTable,
  type InsertPrintJob,
  printJobsTable,
  printersTable,
  warehouseTicketsTable,
} from "@workspace/db";
import { and, asc, eq, isNull, or, type SQL } from "drizzle-orm";

export const PRINTER_ROLES = [
  "customer_receipt",
  "warehouse",
  "kitchen",
  "packing",
  "office",
  "custom",
] as const;

export const PRINT_JOB_STATUSES = ["queued", "printing", "printed", "failed", "cancelled"] as const;

type Transaction = Parameters<Parameters<typeof import("@workspace/db").db.transaction>[0]>[0];

type SaleLine = {
  product: {
    id: string;
    name: string;
    sku: string;
    categoryId: string | null;
    printDestination: string;
    warehouseLocation: string | null;
  };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

type CreatedSale = {
  id: string;
  tenantId: string;
  receiptNumber: string;
  storeId: string | null;
  registerId: string | null;
  cashierId: string;
  totalAmount: string;
  createdAt: Date;
};

function scopeRank(printer: typeof printersTable.$inferSelect, storeId: string | null, registerId: string | null) {
  return (printer.registerId && printer.registerId === registerId ? 4 : 0)
    + (printer.storeId && printer.storeId === storeId ? 2 : 0)
    + (printer.isDefault ? 1 : 0);
}

async function resolvePrinter(
  tx: Transaction,
  tenantId: string,
  role: string,
  storeId: string | null,
  registerId: string | null,
) {
  const scopeConditions: SQL[] = [
    eq(printersTable.tenantId, tenantId),
    eq(printersTable.role, role),
    eq(printersTable.isActive, 1),
  ];
  if (storeId) {
    scopeConditions.push(or(isNull(printersTable.storeId), eq(printersTable.storeId, storeId))!);
  } else {
    scopeConditions.push(isNull(printersTable.storeId));
  }
  if (registerId) {
    scopeConditions.push(or(isNull(printersTable.registerId), eq(printersTable.registerId, registerId))!);
  } else {
    scopeConditions.push(isNull(printersTable.registerId));
  }
  const candidates = await tx.select().from(printersTable)
    .where(and(...scopeConditions))
    .orderBy(asc(printersTable.createdAt));
  return candidates.sort((a, b) => scopeRank(b, storeId, registerId) - scopeRank(a, storeId, registerId))[0] ?? null;
}

function documentTypeForRole(role: string) {
  return role === "customer_receipt" ? "customer_receipt" : `${role}_ticket`;
}

function buildJob(
  sale: CreatedSale,
  printer: typeof printersTable.$inferSelect | null,
  documentType: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): InsertPrintJob {
  return {
    tenantId: sale.tenantId,
    saleId: sale.id,
    storeId: sale.storeId,
    registerId: sale.registerId,
    printerId: printer?.id ?? null,
    documentType,
    status: printer ? "queued" : "failed",
    payload: JSON.stringify({ ...payload, printerName: printer?.deviceName ?? null }),
    errorMessage: printer ? null : `No active ${documentType.replace("_", " ")} printer is configured for this register.`,
    idempotencyKey,
  };
}

export async function createSalePrintJobs(
  tx: Transaction,
  sale: CreatedSale,
  lines: SaleLine[],
  categoryDestinations: Map<string, string>,
) {
  const receiptPrinter = await resolvePrinter(tx, sale.tenantId, "customer_receipt", sale.storeId, sale.registerId);
  const receiptPayload = {
    kind: "customer_receipt",
    receiptNumber: sale.receiptNumber,
    saleId: sale.id,
    totalAmount: Number(sale.totalAmount),
    createdAt: sale.createdAt.toISOString(),
    items: lines.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      sku: line.product.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
    })),
  };
  const jobs: InsertPrintJob[] = [
    buildJob(sale, receiptPrinter, "customer_receipt", receiptPayload, `sale:${sale.id}:customer_receipt`),
  ];

  const routedLines = new Map<string, SaleLine[]>();
  for (const line of lines) {
    const destination = line.product.printDestination === "customer_receipt"
      ? categoryDestinations.get(line.product.categoryId ?? "") ?? "customer_receipt"
      : line.product.printDestination;
    if (destination === "customer_receipt" || destination === "none") continue;
    routedLines.set(destination, [...(routedLines.get(destination) ?? []), line]);
  }

  if (routedLines.has("warehouse")) {
    await tx.insert(warehouseTicketsTable).values({
      tenantId: sale.tenantId,
      saleId: sale.id,
      storeId: sale.storeId,
      registerId: sale.registerId,
      status: "pending",
    }).onConflictDoNothing();
  }

  for (const [role, roleLines] of routedLines) {
    const printer = await resolvePrinter(tx, sale.tenantId, role, sale.storeId, sale.registerId);
    jobs.push(buildJob(sale, printer, documentTypeForRole(role), {
      kind: `${role}_ticket`,
      receiptNumber: sale.receiptNumber,
      saleId: sale.id,
      createdAt: sale.createdAt.toISOString(),
      items: roleLines.map((line) => ({
        productId: line.product.id,
        name: line.product.name,
        sku: line.product.sku,
        quantity: line.quantity,
        warehouseLocation: line.product.warehouseLocation,
      })),
    }, `sale:${sale.id}:${role}`));
  }

  return tx.insert(printJobsTable).values(jobs).onConflictDoNothing().returning();
}

export async function getSalePrintJobs(tenantId: string, saleId: string) {
  return import("@workspace/db").then(({ db }) => db.select().from(printJobsTable)
    .where(and(eq(printJobsTable.tenantId, tenantId), eq(printJobsTable.saleId, saleId))));
}