import type { Request, Response, NextFunction } from "express";
import { db, sessionsTable, usersTable, tenantsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { hasValidManagerAccess } from "../lib/manager-access";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
  avatarUrl: string | null;
  createdAt: Date;
}

const managerRoles = new Set(["owner", "administrator", "manager", "super_admin"]);

export function isManagerRole(role: string): boolean {
  return managerRoles.has(role);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const now = new Date();

  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, now)))
      .limit(1);

    if (!session) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: user.createdAt,
    };
    req.tenantId = user.tenantId;
    next();
  } catch (err) {
    req.log.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    if (req.user?.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

export async function requireManagerAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const sessionToken = req.headers.authorization?.slice(7) ?? "";
    const managerAccessToken = req.header("x-violet-manager-access");

    if (!managerAccessToken || !req.tenantId || !hasValidManagerAccess(managerAccessToken, sessionToken, req.tenantId)) {
      res.status(403).json({ error: "Manager access required" });
      return;
    }

    next();
  });
}
