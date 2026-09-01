import { Router } from "express";
import {
  auditEventsTable, cashEventsTable, db, registersTable, registerShiftsTable, storesTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { requireManagerAccess } from "../middlewares/auth";

const router = Router();

function amount(value: unknown, allowZero = true): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= (allowZero ? 0 : Number.EPSILON) ? parsed : null;
}

router.get("/stores", requireManagerAccess, async (req, res): Promise<void> => {
  const rows = await db.select().from(storesTable)
    .where(eq(storesTable.tenantId, req.tenantId!)).orderBy(storesTable.name);
  res.json({ data: rows });
});

router.post("/stores", requireManagerAccess, async (req, res): Promise<void> => {
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

router.get("/registers", requireManagerAccess, async (req, res): Promise<void> => {
  const conditions: SQL[] = [eq(registersTable.tenantId, req.tenantId!)];
  if (typeof req.query.storeId === "string") conditions.push(eq(registersTable.storeId, req.query.storeId));
  const rows = await db.select().from(registersTable).where(and(...conditions)).orderBy(registersTable.name);
  res.json({ data: rows });
});

router.post("/registers", requireManagerAccess, async (req, res): Promise<void> => {
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
  const conditions: SQL[] = [eq(registerShiftsTable.tenantId, req.tenantId!)];
  if (typeof req.query.storeId === "string") conditions.push(eq(registerShiftsTable.storeId, req.query.storeId));
  if (typeof req.query.registerId === "string") conditions.push(eq(registerShiftsTable.registerId, req.query.registerId));
  if (typeof req.query.status === "string") conditions.push(eq(registerShiftsTable.status, req.query.status));
  const rows = await db.select().from(registerShiftsTable).where(and(...conditions))
    .orderBy(desc(registerShiftsTable.openedAt)).limit(500);
  res.json({ data: rows });
});

router.post("/register-shifts/open", requireManagerAccess, async (req, res): Promise<void> => {
  const { registerId, cashierId } = req.body ?? {}; const openingCash = amount(req.body?.openingCash);
  if (typeof registerId !== "string" || openingCash == null) {
    res.status(400).json({ error: "registerId and a non-negative openingCash are required" }); return;
  }
  const [register] = await db.select().from(registersTable)
    .where(and(eq(registersTable.id, registerId), eq(registersTable.tenantId, req.tenantId!))).limit(1);
  if (!register) { res.status(404).json({ error: "Register not found" }); return; }
  const assignedCashier = typeof cashierId === "string" ? cashierId : req.user!.id;
  const [cashier] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
    eq(usersTable.id, assignedCashier), eq(usersTable.tenantId, req.tenantId!),
  )).limit(1);
  if (!cashier) { res.status(400).json({ error: "Cashier is unavailable for this tenant" }); return; }
  const shift = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${registerId}))`);
    const [existing] = await tx.select().from(registerShiftsTable).where(and(
      eq(registerShiftsTable.tenantId, req.tenantId!), eq(registerShiftsTable.registerId, registerId),
      eq(registerShiftsTable.status, "open"),
    )).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(registerShiftsTable).values({
      tenantId: req.tenantId!, storeId: register.storeId, registerId,
      cashierId: assignedCashier, openedBy: req.user!.id, openingCash: String(openingCash),
    }).returning();
    await tx.insert(auditEventsTable).values({
      tenantId: req.tenantId!, actorId: req.user!.id, storeId: register.storeId,
      action: "shift.opened", entityType: "register_shift", entityId: created.id,
      after: { registerId, cashierId: assignedCashier, openingCash },
    });
    return created;
  });
  res.status(201).json(shift);
});

router.post("/register-shifts/:id/close", requireManagerAccess, async (req, res): Promise<void> => {
  const id = String(req.params.id); const closingCash = amount(req.body?.closingCash);
  if (closingCash == null) { res.status(400).json({ error: "A non-negative closingCash is required" }); return; }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    const [shift] = await tx.select().from(registerShiftsTable)
      .where(and(eq(registerShiftsTable.id, id), eq(registerShiftsTable.tenantId, req.tenantId!))).limit(1);
    if (!shift) return { kind: "missing" as const };
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