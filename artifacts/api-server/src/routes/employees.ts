import { Router } from "express";
import { db, employeesTable, sessionsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireManagerAccess } from "../middlewares/auth";
import { generateTemporaryPassword, hashPassword } from "../lib/crypto";

const router = Router();

function employeeResponse(
  employee: typeof employeesTable.$inferSelect,
  mustChangePassword: boolean | null,
) {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email ?? null,
    phone: employee.phone ?? null,
    role: employee.role,
    department: employee.department ?? null,
    isActive: employee.isActive,
    loginStatus: !employee.isActive
      ? "inactive"
      : mustChangePassword
        ? "password_change_required"
        : "active",
    tenantId: employee.tenantId,
    createdAt: employee.createdAt.toISOString(),
  };
}

// GET /employees
router.get("/employees", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const employees = await db
    .select({ employee: employeesTable, mustChangePassword: usersTable.mustChangePassword })
    .from(employeesTable)
    .leftJoin(usersTable, eq(employeesTable.userId, usersTable.id))
    .where(eq(employeesTable.tenantId, tenantId));
  res.json(employees.map(({ employee, mustChangePassword }) =>
    employeeResponse(employee, mustChangePassword)));
});

// POST /employees
router.post("/employees", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { firstName, lastName, email, phone, role = "employee", department } = req.body;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!firstName || !lastName || !normalizedEmail) {
    res.status(400).json({ error: "First name, last name, and email are required" });
    return;
  }

  const [existing] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing) {
    res.status(409).json({ error: "That email already has a Violet login" });
    return;
  }

  const temporaryPassword = generateTemporaryPassword();
  const emp = await db.transaction(async (tx) => {
    const [user] = await tx.insert(usersTable).values({
      tenantId,
      email: normalizedEmail,
      passwordHash: hashPassword(temporaryPassword),
      firstName,
      lastName,
      role,
      mustChangePassword: true,
    }).returning();
    const [created] = await tx.insert(employeesTable).values({
      tenantId,
      userId: user.id,
      firstName,
      lastName,
      email: normalizedEmail,
      phone,
      role,
      department,
    }).returning();
    return created;
  });
  res.status(201).json({
    ...employeeResponse(emp, true),
    temporaryPassword,
  });
});

// PATCH /employees/:id
router.patch("/employees/:id", requireManagerAccess, async (req, res): Promise<void> => {
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

  const [existingEmployee] = await db.select().from(employeesTable)
    .where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId))).limit(1);
  if (!existingEmployee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  if (email !== undefined) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) {
      res.status(400).json({ error: "Email is required for employee login" });
      return;
    }
    updates.email = normalizedEmail;
    if (existingEmployee.userId) {
      const [emailOwner] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.email, normalizedEmail)).limit(1);
      if (emailOwner && emailOwner.id !== existingEmployee.userId) {
        res.status(409).json({ error: "That email already has a Violet login" });
        return;
      }
    }
  }

  const result = await db.transaction(async (tx) => {
    const [emp] = await tx.update(employeesTable).set(updates)
      .where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId))).returning();
    let mustChangePassword: boolean | null = null;
    if (emp.userId) {
      const userUpdates: Record<string, unknown> = {};
      if (firstName !== undefined) userUpdates.firstName = firstName;
      if (lastName !== undefined) userUpdates.lastName = lastName;
      if (email !== undefined) userUpdates.email = String(email).trim().toLowerCase();
      if (role !== undefined) userUpdates.role = role;
      if (isActive !== undefined) userUpdates.isActive = isActive ? "true" : "false";
      const [user] = Object.keys(userUpdates).length
        ? await tx.update(usersTable).set(userUpdates).where(eq(usersTable.id, emp.userId)).returning()
        : await tx.select().from(usersTable).where(eq(usersTable.id, emp.userId)).limit(1);
      mustChangePassword = user?.mustChangePassword ?? null;
      if (isActive === false) {
        await tx.delete(sessionsTable).where(eq(sessionsTable.userId, emp.userId));
      }
    }
    return { emp, mustChangePassword };
  });
  res.json(employeeResponse(result.emp, result.mustChangePassword));
});

// DELETE /employees/:id
router.delete("/employees/:id", requireManagerAccess, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [employee] = await db.select().from(employeesTable)
    .where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId))).limit(1);
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(employeesTable).where(eq(employeesTable.id, employee.id));
    if (employee.userId) {
      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, employee.userId));
      await tx.delete(usersTable).where(eq(usersTable.id, employee.userId));
    }
  });
  res.json({ success: true });
});

export default router;
