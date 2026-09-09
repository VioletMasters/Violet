import { Router, type Request } from "express";
import {
  auditEventsTable, cashEventsTable, db, registersTable, registerShiftsTable, storesTable,
  usersTable,
} from "@workspace/db";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { isManagerRole, requireAuth, requireManagerAccess } from "../middlewares/auth";
import { enforceTenantLimit, entitlementErrorResponse } from "../lib/entitlements";

function canConfigureStoresAndRegisters(role: string): boolean {
  return role === "owner" || role === "administrator" || role === "super_admin";
}

const router = Router();
const cashierUsers = alias(usersTable, "register_shift_cashiers");
const settlingUsers = alias(usersTable, "register_shift_settlers");
type RegisterShiftStatus = "open" | "closed";

function amount(value: unknown, allowZero = true): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= (allowZero ? 0 : Number.EPSILON) ? parsed : null;
}

function registerShiftFilters(
  query: Request["query"],
  tenantId: string,
  forcedStatus?: RegisterShiftStatus,
): { conditions: SQL[]; error?: string } {
  const conditions: SQL[] = [eq(registerShiftsTable.tenantId, tenantId)];
  if (typeof query.storeId === "string") conditions.push(eq(registerShiftsTable.storeId, query.storeId));
  if (typeof query.registerId === "string") conditions.push(eq(registerShiftsTable.registerId, query.registerId));
  if (typeof query.cashierId === "string") conditions.push(eq(registerShiftsTable.cashierId, query.cashierId));
  if (forcedStatus) {
    conditions.push(eq(registerShiftsTable.status, forcedStatus));
  } else if (typeof query.status === "string") {
    conditions.push(eq(registerShiftsTable.status, query.status));
  }
  if (typeof query.startDate === "string") {
    const startDate = new Date(query.startDate);
    if (Number.isNaN(startDate.getTime())) return { conditions, error: "Invalid startDate" };
    conditions.push(gte(registerShiftsTable.closedAt, startDate));
  }
  if (typeof query.endDate === "string") {
    const endDate = new Date(query.endDate);
    if (Number.isNaN(endDate.getTime())) return { conditions, error: "Invalid endDate" };
    conditions.push(lte(registerShiftsTable.closedAt, endDate));
  }
  return { conditions };
}

function registerShiftRows(conditions: SQL[], tenantId: string) {
  return db.select({
    id: registerShiftsTable.id,
    tenantId: registerShiftsTable.tenantId,
    storeId: registerShiftsTable.storeId,
    storeName: storesTable.name,
    registerId: registerShiftsTable.registerId,
    registerName: registersTable.name,
    cashierId: registerShiftsTable.cashierId,
    cashierName: sql<string>`concat(${cashierUsers.firstName}, ' ', ${cashierUsers.lastName})`,
    openedBy: registerShiftsTable.openedBy,
    closedBy: registerShiftsTable.closedBy,
    settledByName: sql<string>`concat(${settlingUsers.firstName}, ' ', ${settlingUsers.lastName})`,
    status: registerShiftsTable.status,
    openingCash: registerShiftsTable.openingCash,
    expectedCash: registerShiftsTable.expectedCash,
    closingCash: registerShiftsTable.closingCash,
    variance: registerShiftsTable.variance,
    openedAt: registerShiftsTable.openedAt,
    closedAt: registerShiftsTable.closedAt,
  }).from(registerShiftsTable)
    .leftJoin(storesTable, and(
      eq(storesTable.id, registerShiftsTable.storeId),
      eq(storesTable.tenantId, tenantId),
    ))
    .leftJoin(registersTable, and(
      eq(registersTable.id, registerShiftsTable.registerId),
      eq(registersTable.tenantId, tenantId),
    ))
    .leftJoin(cashierUsers, and(
      eq(cashierUsers.id, registerShiftsTable.cashierId),
      eq(cashierUsers.tenantId, tenantId),
    ))
    .leftJoin(settlingUsers, and(
      eq(settlingUsers.id, registerShiftsTable.closedBy),
      eq(settlingUsers.tenantId, tenantId),
    ))
    .where(and(...conditions))
    .orderBy(desc(registerShiftsTable.closedAt), desc(registerShiftsTable.openedAt)).limit(500);
}

router.get("/stores", requireManagerAccess, async (req, res): Promise<void> => {
  const rows = await db.select().from(storesTable)
    .where(eq(storesTable.tenantId, req.tenantId!)).orderBy(storesTable.name);
  res.json({ data: rows });
});

router.post("/stores", requireManagerAccess, async (req, res): Promise<void> => {
  if (!canConfigureStoresAndRegisters(req.user!.role)) {
    res.status(403).json({ error: "Only the owner or administrator can create stores and registers" }); return;
  }
  try {
    await enforceTenantLimit(req.tenantId!, "branches");
  } catch (error) {
    const response = entitlementErrorResponse(error);
    if (response) {
      res.status(response.status).json(response.body);
      return;
    }
    throw error;
  }
  const { code, name, address, timezone } = req.body ?? {};
  if (typeof code !== "string" || !code.trim() || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "code and name are required" }); return;
  }
  try {
    const store = await db.transaction(async (tx) => {
      const [created] = await tx.insert(storesTable).values({
        tenantId: req.tenantId!, code: code.trim(), name: name.trim(),
        address: typeof address === "string" ? address : undefined,
        timezone: typeof timezone === "string" && timezone ? timezone : "UTC",
      }).returning();
      await tx.insert(auditEventsTable).values({
        tenantId: req.tenantId!, actorId: req.user!.id, storeId: created.id,
        action: "store.created", entityType: "store", entityId: created.id, after: created,
      });
      return created;
    });
    res.status(201).json(store);
  } catch (error: any) {
    if (error?.code === "23505") { res.status(409).json({ error: "Store code already exists" }); return; }
    throw error;
  }
});

router.get("/registers", requireAuth, async (req, res): Promise<void> => {
  const conditions: SQL[] = [eq(registersTable.tenantId, req.tenantId!)];
  if (typeof req.query.storeId === "string") conditions.push(eq(registersTable.storeId, req.query.storeId));
  const rows = await db.select().from(registersTable).where(and(...conditions)).orderBy(registersTable.name);
  res.json({ data: rows });
});

router.post("/registers", requireManagerAccess, async (req, res): Promise<void> => {
  if (!canConfigureStoresAndRegisters(req.user!.role)) {
    res.status(403).json({ error: "Only the owner or administrator can create stores and registers" }); return;
  }
  try {
    await enforceTenantLimit(req.tenantId!, "registers");
  } catch (error) {
    const response = entitlementErrorResponse(error);
    if (response) {
      res.status(response.status).json(response.body);
      return;
    }
    throw error;
  }
  const { storeId, code, name } = req.body ?? {};
  if (typeof storeId !== "string" || typeof code !== "string" || !code.trim() || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "storeId, code, and name are required" }); return;
  }
  const [store] = await db.select().from(storesTable)
    .where(and(eq(storesTable.id, storeId), eq(storesTable.tenantId, req.tenantId!))).limit(1);
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  try {
    const register = await db.transaction(async (tx) => {
      const [created] = await tx.insert(registersTable).values({
        tenantId: req.tenantId!, storeId, code: code.trim(), name: name.trim(),
      }).returning();
      await tx.insert(auditEventsTable).values({
        tenantId: req.tenantId!, actorId: req.user!.id, storeId,
        action: "register.created", entityType: "register", entityId: created.id, after: created,
      });
      return created;
    });
    res.status(201).json(register);
  } catch (error: any) {
    if (error?.code === "23505") { res.status(409).json({ error: "Register code already exists at this store" }); return; }
    throw error;
  }
});

router.get("/register-shifts", requireManagerAccess, async (req, res): Promise<void> => {
  const { conditions, error } = registerShiftFilters(req.query, req.tenantId!);
  if (error) { res.status(400).json({ error }); return; }
  const rows = await registerShiftRows(conditions, req.tenantId!);
  res.json({ data: rows });
});

router.get("/register-shifts/export", requireManagerAccess, async (req, res): Promise<void> => {
  if (typeof req.query.startDate !== "string" || typeof req.query.endDate !== "string") {
    res.status(400).json({ error: "startDate and endDate are required" }); return;
  }
  const { conditions, error } = registerShiftFilters(req.query, req.tenantId!, "closed");
  if (error) { res.status(400).json({ error }); return; }
  const rows = await registerShiftRows(conditions, req.tenantId!);
  const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const display = (value: unknown, fallback: string) => {
    const text = String(value ?? "").trim();
    return text || fallback;
  };
  const lines = [
    ["Store", "Register", "Cashier", "Close time", "Opening float", "Expected cash", "Counted cash", "Variance", "Settled by"],
    ...rows.map((row) => [
      display(row.storeName, row.storeId),
      display(row.registerName, row.registerId),
      display(row.cashierName, row.cashierId),
      row.closedAt?.toISOString() ?? "",
      row.openingCash,
      row.expectedCash,
      row.closingCash,
      row.variance,
      display(row.settledByName, row.closedBy ?? "Unknown"),
    ]),
  ].map((row) => row.map(csvEscape).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="violet-closed-settlements.csv"');
  res.send(lines.join("\n"));
});

router.get("/register-shifts/current", requireAuth, async (req, res): Promise<void> => {
  const [shift] = await db.select().from(registerShiftsTable).where(and(
    eq(registerShiftsTable.tenantId, req.tenantId!),
    eq(registerShiftsTable.cashierId, req.user!.id),
    eq(registerShiftsTable.status, "open"),
  )).orderBy(desc(registerShiftsTable.openedAt)).limit(1);
  res.json({ shift: shift ?? null });
});

router.post("/register-shifts/open", requireAuth, async (req, res): Promise<void> => {
  const { registerId, cashierId } = req.body ?? {}; const openingCash = amount(req.body?.openingCash);
  if (typeof registerId !== "string" || openingCash == null) {
    res.status(400).json({ error: "registerId and a non-negative openingCash are required" }); return;
  }
  const [register] = await db.select().from(registersTable)
    .where(and(
      eq(registersTable.id, registerId),
      eq(registersTable.tenantId, req.tenantId!),
      eq(registersTable.isActive, true),
    )).limit(1);
  if (!register) { res.status(404).json({ error: "Register not found" }); return; }
  if (!isManagerRole(req.user!.role) && typeof cashierId === "string" && cashierId !== req.user!.id) {
    res.status(403).json({ error: "Cashiers can only open their own shift" }); return;
  }
  const assignedCashier = isManagerRole(req.user!.role) && typeof cashierId === "string"
    ? cashierId
    : req.user!.id;
  const [cashier] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
    eq(usersTable.id, assignedCashier), eq(usersTable.tenantId, req.tenantId!),
    eq(usersTable.isActive, "true"),
  )).limit(1);
  if (!cashier) { res.status(400).json({ error: "Cashier is unavailable for this tenant" }); return; }
  const result = await db.transaction(async (tx) => {
    // Lock the cashier first so two requests cannot open two drawers for one cashier.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${assignedCashier}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${registerId}))`);
    const [availableRegister] = await tx.select({ storeId: registersTable.storeId }).from(registersTable).where(and(
      eq(registersTable.id, registerId),
      eq(registersTable.tenantId, req.tenantId!),
      eq(registersTable.isActive, true),
    )).limit(1);
    if (!availableRegister) return { kind: "missing_register" as const };
    const [existing] = await tx.select().from(registerShiftsTable).where(and(
      eq(registerShiftsTable.tenantId, req.tenantId!), eq(registerShiftsTable.registerId, registerId),
      eq(registerShiftsTable.status, "open"),
    )).limit(1);
    if (existing) {
      if (existing.cashierId !== assignedCashier) return { kind: "occupied" as const, shift: existing };
      return { kind: "existing" as const, shift: existing };
    }
    const [cashierShift] = await tx.select({ id: registerShiftsTable.id }).from(registerShiftsTable).where(and(
      eq(registerShiftsTable.tenantId, req.tenantId!),
      eq(registerShiftsTable.cashierId, assignedCashier),
      eq(registerShiftsTable.status, "open"),
    )).limit(1);
    if (cashierShift) return { kind: "cashier_occupied" as const };
    const [created] = await tx.insert(registerShiftsTable).values({
      tenantId: req.tenantId!, storeId: availableRegister.storeId, registerId,
      cashierId: assignedCashier, openedBy: req.user!.id, openingCash: String(openingCash),
    }).returning();
    await tx.insert(auditEventsTable).values({
      tenantId: req.tenantId!, actorId: req.user!.id, storeId: availableRegister.storeId,
      action: "shift.opened", entityType: "register_shift", entityId: created.id,
      after: { registerId, cashierId: assignedCashier, openingCash },
    });
    return { kind: "created" as const, shift: created };
  });
  if (result.kind === "occupied") {
    res.status(409).json({ error: "This register already has an active cashier day" });
    return;
  }
  if (result.kind === "cashier_occupied") {
    res.status(409).json({ error: "This cashier already has an active cashier day" });
    return;
  }
  if (result.kind === "missing_register") {
    res.status(404).json({ error: "Register not found" });
    return;
  }
  res.status(result.kind === "existing" ? 200 : 201).json(result.shift);
});

router.post("/register-shifts/:id/close", requireAuth, async (req, res): Promise<void> => {
  const id = String(req.params.id); const closingCash = amount(req.body?.closingCash);
  if (closingCash == null) { res.status(400).json({ error: "A non-negative closingCash is required" }); return; }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    const [shift] = await tx.select().from(registerShiftsTable)
      .where(and(eq(registerShiftsTable.id, id), eq(registerShiftsTable.tenantId, req.tenantId!))).limit(1);
    if (!shift) return { kind: "missing" as const };
    if (!isManagerRole(req.user!.role) && shift.cashierId !== req.user!.id) {
      return { kind: "forbidden" as const };
    }
    if (shift.status === "closed") return { kind: "closed" as const, shift };
    const [cash] = await tx.select({ total: sql<string>`COALESCE(SUM(${cashEventsTable.amount}::numeric), 0)` })
      .from(cashEventsTable).where(and(eq(cashEventsTable.tenantId, req.tenantId!), eq(cashEventsTable.shiftId, id)));
    const expectedCash = Number(shift.openingCash) + Number(cash?.total ?? 0);
    const variance = closingCash - expectedCash;
    const [closed] = await tx.update(registerShiftsTable).set({
      status: "closed", closingCash: String(closingCash), expectedCash: String(expectedCash),
      variance: String(variance), closedBy: req.user!.id, closedAt: new Date(),
    }).where(and(eq(registerShiftsTable.id, id), eq(registerShiftsTable.tenantId, req.tenantId!))).returning();
    await tx.insert(auditEventsTable).values({
      tenantId: req.tenantId!, actorId: req.user!.id, storeId: shift.storeId,
      action: "shift.closed", entityType: "register_shift", entityId: id,
      before: { status: shift.status }, after: { status: "closed", expectedCash, closingCash, variance },
    });
    return { kind: "updated" as const, shift: closed };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Shift not found" }); return; }
  if (result.kind === "forbidden") { res.status(403).json({ error: "You can only settle your own shift" }); return; }
  res.json(result.shift);
});

router.post("/register-shifts/:id/cash-events", requireManagerAccess, async (req, res): Promise<void> => {
  const id = String(req.params.id); const { type, reason } = req.body ?? {}; const inputAmount = amount(req.body?.amount, false);
  if (!["drop", "payout"].includes(type) || inputAmount == null || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "type (drop or payout), positive amount, and reason are required" }); return;
  }
  const idempotencyKey = req.header("idempotency-key") ?? undefined;
  if (idempotencyKey) {
    const [existing] = await db.select().from(cashEventsTable).where(and(
      eq(cashEventsTable.tenantId, req.tenantId!), eq(cashEventsTable.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (existing) {
      if (existing.shiftId !== id) { res.status(409).json({ error: "Idempotency key was already used for another shift" }); return; }
      res.json(existing); return;
    }
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    if (idempotencyKey) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const [duplicate] = await tx.select().from(cashEventsTable).where(and(
        eq(cashEventsTable.tenantId, req.tenantId!), eq(cashEventsTable.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (duplicate) return duplicate.shiftId === id
        ? { kind: "existing" as const, event: duplicate }
        : { kind: "idempotency_conflict" as const };
    }
    const [shift] = await tx.select().from(registerShiftsTable).where(and(
      eq(registerShiftsTable.id, id), eq(registerShiftsTable.tenantId, req.tenantId!), eq(registerShiftsTable.status, "open"),
    )).limit(1);
    if (!shift) return { kind: "missing" as const };
    const [created] = await tx.insert(cashEventsTable).values({
      tenantId: req.tenantId!, storeId: shift.storeId, registerId: shift.registerId, shiftId: shift.id,
      type, amount: String(-inputAmount), reason: reason.trim(), createdBy: req.user!.id,
      approvedBy: req.user!.id, idempotencyKey,
    }).returning();
    await tx.insert(auditEventsTable).values({
      tenantId: req.tenantId!, actorId: req.user!.id, storeId: shift.storeId,
      action: `cash.${type}`, entityType: "cash_event", entityId: created.id,
      reason: reason.trim(), after: { shiftId: id, amount: inputAmount },
    });
    return { kind: "created" as const, event: created };
  });
  if (result.kind === "missing") { res.status(409).json({ error: "Open shift not found" }); return; }
  if (result.kind === "idempotency_conflict") { res.status(409).json({ error: "Idempotency key was already used for another shift" }); return; }
  res.status(result.kind === "existing" ? 200 : 201).json(result.event);
});

router.get("/audit-events", requireManagerAccess, async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const conditions: SQL[] = [eq(auditEventsTable.tenantId, req.tenantId!)];
  if (typeof req.query.action === "string") conditions.push(eq(auditEventsTable.action, req.query.action));
  if (typeof req.query.entityType === "string") conditions.push(eq(auditEventsTable.entityType, req.query.entityType));
  if (typeof req.query.startDate === "string") conditions.push(gte(auditEventsTable.createdAt, new Date(req.query.startDate)));
  const [data, count] = await Promise.all([
    db.select().from(auditEventsTable).where(and(...conditions)).orderBy(desc(auditEventsTable.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`COUNT(*)` }).from(auditEventsTable).where(and(...conditions)),
  ]);
  res.json({ data, total: Number(count[0]?.total ?? 0), page, limit });
});

export default router;