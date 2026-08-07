import { Router } from "express";
import { db, employeesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /employees
router.get("/employees", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.tenantId, tenantId));
  res.json(employees.map(e => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email ?? null,
    phone: e.phone ?? null,
    role: e.role,
    department: e.department ?? null,
    isActive: e.isActive,
    tenantId: e.tenantId,
    createdAt: e.createdAt.toISOString(),
  })));
});

// POST /employees
router.post("/employees", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { firstName, lastName, email, phone, role = "employee", department } = req.body;
  if (!firstName) {
    res.status(400).json({ error: "firstName is required" });
    return;
  }
  const [emp] = await db.insert(employeesTable).values({ tenantId, firstName, lastName, email, phone, role, department }).returning();
  res.status(201).json({
    id: emp.id,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email ?? null,
    phone: emp.phone ?? null,
    role: emp.role,
    department: emp.department ?? null,
    isActive: emp.isActive,
    tenantId: emp.tenantId,
    createdAt: emp.createdAt.toISOString(),
  });
});

// PATCH /employees/:id
router.patch("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { firstName, lastName, email, phone, role, department, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (role !== undefined) updates.role = role;
  if (department !== undefined) updates.department = department;
  if (isActive !== undefined) updates.isActive = isActive;

  const [emp] = await db.update(employeesTable).set(updates)
    .where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId))).returning();
  if (!emp) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json({
    id: emp.id,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email ?? null,
    phone: emp.phone ?? null,
    role: emp.role,
    department: emp.department ?? null,
    isActive: emp.isActive,
    tenantId: emp.tenantId,
    createdAt: emp.createdAt.toISOString(),
  });
});

// DELETE /employees/:id
router.delete("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await db.delete(employeesTable).where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId)));
  res.json({ success: true });
});

export default router;
