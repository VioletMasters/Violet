import { Router } from "express";
import {
  db,
  printJobsTable,
  printersTable,
  registersTable,
  storesTable,
} from "@workspace/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { requireAuth, requireManagerAccess } from "../middlewares/auth";
import { PRINTER_ROLES, PRINT_JOB_STATUSES } from "../lib/printer-routing";

const router = Router();
const CONNECTION_TYPES = ["os", "usb", "network", "shared"] as const;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function validateScope(tenantId: string, storeId: string | null, registerId: string | null) {
  if (!storeId && registerId) return "registerId requires storeId";
  if (storeId) {
    const [store] = await db.select({ id: storesTable.id }).from(storesTable)
      .where(and(eq(storesTable.id, storeId), eq(storesTable.tenantId, tenantId))).limit(1);
    if (!store) return "Store not found for this business";
  }
  if (registerId) {
    const [register] = await db.select({ id: registersTable.id }).from(registersTable)
      .where(and(
        eq(registersTable.id, registerId),
        eq(registersTable.tenantId, tenantId),
        eq(registersTable.storeId, storeId!),
      )).limit(1);
    if (!register) return "Register not found for this store";
  }
  return null;
}

function serializePrinter(printer: typeof printersTable.$inferSelect) {
  return {
    ...printer,
    isActive: Boolean(printer.isActive),
    isDefault: Boolean(printer.isDefault),
    createdAt: printer.createdAt.toISOString(),
    updatedAt: printer.updatedAt.toISOString(),
  };
}

router.get("/printers", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const rows = await db.select().from(printersTable)
    .where(eq(printersTable.tenantId, tenantId))
    .orderBy(desc(printersTable.isDefault), printersTable.name);
  res.json({
    data: rows.map(serializePrinter),
    roles: PRINTER_ROLES,
    connectionTypes: CONNECTION_TYPES,
  });
});

router.post("/printers", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const name = stringValue(req.body?.name);
  const deviceName = stringValue(req.body?.deviceName);
  const role = stringValue(req.body?.role) || "customer_receipt";
  const connectionType = stringValue(req.body?.connectionType) || "os";
  const storeId = stringValue(req.body?.storeId) || null;
  const registerId = stringValue(req.body?.registerId) || null;
  const isDefault = Boolean(req.body?.isDefault);

  if (!name || !deviceName) {
    res.status(400).json({ error: "name and deviceName are required" });
    return;
  }
  if (!PRINTER_ROLES.includes(role as typeof PRINTER_ROLES[number])) {
    res.status(400).json({ error: "Unsupported printer role" });
    return;
  }
  if (!CONNECTION_TYPES.includes(connectionType as typeof CONNECTION_TYPES[number])) {
    res.status(400).json({ error: "Unsupported printer connection type" });
    return;
  }
  const scopeError = await validateScope(tenantId, storeId, registerId);
  if (scopeError) {
    res.status(400).json({ error: scopeError });
    return;
  }

  const created = await db.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(printersTable).set({ isDefault: 0 }).where(and(
        eq(printersTable.tenantId, tenantId),
        eq(printersTable.role, role),
        storeId ? eq(printersTable.storeId, storeId) : isNull(printersTable.storeId),
        registerId ? eq(printersTable.registerId, registerId) : isNull(printersTable.registerId),
      ));
    }
    const [printer] = await tx.insert(printersTable).values({
      tenantId,
      storeId,
      registerId,
      name,
      role,
      connectionType,
      deviceName,
      deviceAddress: stringValue(req.body?.deviceAddress) || null,
      platform: stringValue(req.body?.platform) || null,
      isActive: req.body?.isActive === false ? 0 : 1,
      isDefault: isDefault ? 1 : 0,
    }).returning();
    return printer;
  });
  res.status(201).json(serializePrinter(created));
});

router.patch("/printers/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = String(req.params.id);
  const [existing] = await db.select().from(printersTable)
    .where(and(eq(printersTable.id, id), eq(printersTable.tenantId, tenantId))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Printer not found" });
    return;
  }

  const storeId = req.body?.storeId === null ? null : stringValue(req.body?.storeId) || existing.storeId;
  const registerId = req.body?.registerId === null ? null : stringValue(req.body?.registerId) || existing.registerId;
  const role = req.body?.role === undefined ? existing.role : stringValue(req.body.role);
  const scopeError = await validateScope(tenantId, storeId, registerId);
  if (scopeError) {
    res.status(400).json({ error: scopeError });
    return;
  }
  if (!PRINTER_ROLES.includes(role as typeof PRINTER_ROLES[number])) {
    res.status(400).json({ error: "Unsupported printer role" });
    return;
  }

  const isDefault = req.body?.isDefault === undefined ? Boolean(existing.isDefault) : Boolean(req.body.isDefault);
  const updated = await db.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(printersTable).set({ isDefault: 0 }).where(and(
        eq(printersTable.tenantId, tenantId),
        eq(printersTable.role, role),
        storeId ? eq(printersTable.storeId, storeId) : isNull(printersTable.storeId),
        registerId ? eq(printersTable.registerId, registerId) : isNull(printersTable.registerId),
      ));
    }
    const [printer] = await tx.update(printersTable).set({
      storeId,
      registerId,
      name: req.body?.name === undefined ? existing.name : stringValue(req.body.name),
      role,
      connectionType: req.body?.connectionType === undefined ? existing.connectionType : stringValue(req.body.connectionType),
      deviceName: req.body?.deviceName === undefined ? existing.deviceName : stringValue(req.body.deviceName),
      deviceAddress: req.body?.deviceAddress === undefined ? existing.deviceAddress : stringValue(req.body.deviceAddress) || null,
      platform: req.body?.platform === undefined ? existing.platform : stringValue(req.body.platform) || null,
      isActive: req.body?.isActive === undefined ? existing.isActive : req.body.isActive ? 1 : 0,
      isDefault: isDefault ? 1 : 0,
      updatedAt: new Date(),
    }).where(and(eq(printersTable.id, id), eq(printersTable.tenantId, tenantId))).returning();
    return printer;
  });
  res.json(serializePrinter(updated));
});

router.delete("/printers/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const deleted = await db.delete(printersTable).where(and(
    eq(printersTable.id, String(req.params.id)),
    eq(printersTable.tenantId, req.tenantId!),
  )).returning({ id: printersTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Printer not found" });
    return;
  }
  res.json({ success: true });
});

router.get("/print-jobs", requireManagerAccess, async (req, res): Promise<void> => {
  const conditions = [eq(printJobsTable.tenantId, req.tenantId!)];
  if (typeof req.query.status === "string" && PRINT_JOB_STATUSES.includes(req.query.status as typeof PRINT_JOB_STATUSES[number])) {
    conditions.push(eq(printJobsTable.status, req.query.status));
  }
  if (typeof req.query.saleId === "string") conditions.push(eq(printJobsTable.saleId, req.query.saleId));
  const rows = await db.select().from(printJobsTable)
    .where(and(...conditions))
    .orderBy(desc(printJobsTable.createdAt))
    .limit(Math.min(200, Math.max(1, Number(req.query.limit) || 50)));
  res.json({ data: rows });
});

router.post("/print-jobs/:id/retry", requireManagerAccess, async (req, res): Promise<void> => {
  const [job] = await db.update(printJobsTable).set({
    status: "queued",
    errorMessage: null,
    retryCount: sql`${printJobsTable.retryCount} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(printJobsTable.id, String(req.params.id)),
    eq(printJobsTable.tenantId, req.tenantId!),
  )).returning();
  if (!job) {
    res.status(404).json({ error: "Print job not found" });
    return;
  }
  res.json(job);
});

router.post("/print-jobs/:id/status", requireAuth, async (req, res): Promise<void> => {
  const status = stringValue(req.body?.status);
  if (!PRINT_JOB_STATUSES.includes(status as typeof PRINT_JOB_STATUSES[number])) {
    res.status(400).json({ error: "Unsupported print job status" });
    return;
  }
  const [job] = await db.update(printJobsTable).set({
    status,
    errorMessage: status === "failed" ? stringValue(req.body?.errorMessage) || "The printer reported an error." : null,
    printedAt: status === "printed" ? new Date() : undefined,
    updatedAt: new Date(),
  }).where(and(
    eq(printJobsTable.id, String(req.params.id)),
    eq(printJobsTable.tenantId, req.tenantId!),
  )).returning();
  if (!job) {
    res.status(404).json({ error: "Print job not found" });
    return;
  }
  res.json(job);
});

export default router;