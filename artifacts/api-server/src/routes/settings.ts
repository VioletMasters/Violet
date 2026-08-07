import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /settings
router.get("/settings", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.tenantId, tenantId)).limit(1);
  if (!settings) {
    res.status(404).json({ error: "Settings not found" });
    return;
  }
  res.json({
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    businessPhone: settings.businessPhone ?? null,
    address: settings.address ?? null,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    taxRate: parseFloat(settings.taxRate),
    taxName: settings.taxName,
    receiptFooter: settings.receiptFooter ?? null,
    logoUrl: settings.logoUrl ?? null,
    timezone: settings.timezone,
  });
});

// PATCH /settings
router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { businessName, businessEmail, businessPhone, address, currency, currencySymbol, taxRate, taxName, receiptFooter, logoUrl, timezone } = req.body;

  const updates: Record<string, unknown> = {};
  if (businessName !== undefined) updates.businessName = businessName;
  if (businessEmail !== undefined) updates.businessEmail = businessEmail;
  if (businessPhone !== undefined) updates.businessPhone = businessPhone;
  if (address !== undefined) updates.address = address;
  if (currency !== undefined) updates.currency = currency;
  if (currencySymbol !== undefined) updates.currencySymbol = currencySymbol;
  if (taxRate !== undefined) updates.taxRate = String(taxRate);
  if (taxName !== undefined) updates.taxName = taxName;
  if (receiptFooter !== undefined) updates.receiptFooter = receiptFooter;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;
  if (timezone !== undefined) updates.timezone = timezone;

  const [settings] = await db.update(settingsTable).set(updates)
    .where(eq(settingsTable.tenantId, tenantId)).returning();

  if (!settings) {
    res.status(404).json({ error: "Settings not found" });
    return;
  }

  res.json({
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    businessPhone: settings.businessPhone ?? null,
    address: settings.address ?? null,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    taxRate: parseFloat(settings.taxRate),
    taxName: settings.taxName,
    receiptFooter: settings.receiptFooter ?? null,
    logoUrl: settings.logoUrl ?? null,
    timezone: settings.timezone,
  });
});

export default router;
