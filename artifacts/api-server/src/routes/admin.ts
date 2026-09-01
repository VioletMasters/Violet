import { Router } from "express";
import {
  db, tenantsTable, usersTable, plansTable,
  subscriptionsTable, productsTable, customersTable,
  salesTable, releasesTable, releaseAssetsTable, platformAuditLogsTable, settingsTable,
} from "@workspace/db";
import { eq, ilike, and, sql, inArray, gte, lte, desc } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/auth";
import { getWhopClient } from "../lib/whopClient";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const router = Router();
const RELEASE_ROOT = path.join(process.cwd(), "data", "platform-releases");
const RELEASE_PLATFORMS = new Set(["windows", "macos", "linux", "docker"]);
const RELEASE_CHANNELS = new Set(["stable", "beta", "nightly"]);

function publicPlan(p: typeof plansTable.$inferSelect) {
  return {
    id: p.id, name: p.name, tier: p.tier, description: p.description ?? "",
    price: parseFloat(p.price), annualPrice: p.annualPrice ? parseFloat(p.annualPrice) : null,
    billingType: p.billingType, currency: p.currency ?? "USD", whopPlanId: p.whopPlanId ?? null,
    maxUsers: p.maxUsers, maxRegisters: p.maxRegisters, maxBranches: p.maxBranches,
    maxProducts: p.maxProducts, maxCustomers: p.maxCustomers, features: p.features ?? [],
    isActive: p.isActive, isPopular: p.isPopular, trialDays: p.trialDays,
  };
}

async function audit(req: Parameters<typeof requireSuperAdmin>[0], action: string, entityType: string, entityId: string | null, summary: string, metadata?: unknown) {
  if (!req.user) return;
  await db.insert(platformAuditLogsTable).values({
    actorId: req.user.id, action, entityType, entityId, summary,
    metadata: metadata === undefined ? undefined : JSON.stringify(metadata),
  });
}

function safeFileName(name: string) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "-");
  return base.slice(0, 180) || "release-package";
}

function validPlatform(value: unknown): value is string {
  return typeof value === "string" && RELEASE_PLATFORMS.has(value);
}

function validDownloadUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) return false;
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function hasUsableAsset(asset: { downloadUrl: string | null; storagePath: string }) {
  return Boolean(asset.downloadUrl) || fs.existsSync(asset.storagePath);
}

// ─── Platform release management ─────────────────────────────────────────────
router.get("/admin/releases", requireSuperAdmin, async (_req, res): Promise<void> => {
  const releases = await db.select().from(releasesTable).orderBy(desc(releasesTable.createdAt));
  const assets = releases.length
    ? await db.select().from(releaseAssetsTable).where(inArray(releaseAssetsTable.releaseId, releases.map(r => r.id)))
    : [];
  const assetsByRelease = new Map<string, typeof assets>();
  for (const asset of assets) assetsByRelease.set(asset.releaseId, [...(assetsByRelease.get(asset.releaseId) ?? []), asset]);
  res.json(releases.map(release => ({
    ...release,
    publishedAt: release.publishedAt?.toISOString() ?? null,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
    assets: (assetsByRelease.get(release.id) ?? []).map(asset => ({
      ...asset, createdAt: asset.createdAt.toISOString(),
    })),
  })));
});

router.post("/admin/releases", requireSuperAdmin, async (req, res): Promise<void> => {
  const { version, channel = "stable", releaseNotes = "" } = req.body ?? {};
  if (typeof version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version.trim())) {
    res.status(400).json({ error: "Version must use semantic version format, for example 1.4.0." });
    return;
  }
  if (typeof channel !== "string" || !RELEASE_CHANNELS.has(channel)) {
    res.status(400).json({ error: "Choose a valid release channel." });
    return;
  }
  const [release] = await db.insert(releasesTable).values({
    version: version.trim(), channel, releaseNotes: typeof releaseNotes === "string" ? releaseNotes.trim() : "",
    createdBy: req.user!.id,
  }).returning();
  await audit(req, "release.created", "release", release.id, `Created Violet ${release.version} release`, { channel });
  res.status(201).json({ ...release, publishedAt: null, createdAt: release.createdAt.toISOString(), updatedAt: release.updatedAt.toISOString(), assets: [] });
});

router.patch("/admin/releases/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
  const updates: Record<string, unknown> = {};
  if (req.body?.releaseNotes !== undefined) updates.releaseNotes = String(req.body.releaseNotes);
  if (req.body?.channel !== undefined && RELEASE_CHANNELS.has(req.body.channel)) updates.channel = req.body.channel;
  if (req.body?.status !== undefined) {
    if (!["draft", "published", "archived"].includes(req.body.status)) {
      res.status(400).json({ error: "Invalid release status." }); return;
    }
    if (req.body.status === "published") {
      const [asset] = await db.select({
        id: releaseAssetsTable.id,
        downloadUrl: releaseAssetsTable.downloadUrl,
        storagePath: releaseAssetsTable.storagePath,
      })
        .from(releaseAssetsTable).where(eq(releaseAssetsTable.releaseId, id)).limit(1);
      if (!asset || !hasUsableAsset(asset)) {
        res.status(400).json({ error: "Upload at least one platform package before publishing this release." });
        return;
      }
    }
    updates.status = req.body.status;
    updates.publishedAt = req.body.status === "published" ? new Date() : null;
  }
  const [release] = await db.update(releasesTable).set(updates).where(eq(releasesTable.id, id)).returning();
  await audit(req, `release.${updates.status ?? "updated"}`, "release", id, `Updated Violet ${release.version} release`, updates);
  const assets = await db.select().from(releaseAssetsTable).where(eq(releaseAssetsTable.releaseId, id));
  res.json({ ...release, publishedAt: release.publishedAt?.toISOString() ?? null, createdAt: release.createdAt.toISOString(), updatedAt: release.updatedAt.toISOString(), assets: assets.map(asset => ({ ...asset, createdAt: asset.createdAt.toISOString() })) });
});

// Package bytes are streamed to the server when App Storage is unavailable.
router.put("/admin/releases/:id/assets/:platform", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const platform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
  if (!validPlatform(platform)) { res.status(400).json({ error: "Invalid release platform." }); return; }
  const fileName = safeFileName(String(req.header("x-violet-file-name") ?? `${platform}-package`));
  const contentType = String(req.header("content-type") ?? "application/octet-stream");
  const contentLength = Number(req.header("content-length") ?? 0);
  if (contentLength > 1024 * 1024 * 1024) { res.status(413).json({ error: "Release packages must be smaller than 1 GB." }); return; }
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, id)).limit(1);
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }
  const folder = path.join(RELEASE_ROOT, id);
  await fs.promises.mkdir(folder, { recursive: true });
  const storagePath = path.join(folder, `${platform}-${fileName}`);
  try {
    await pipeline(req, fs.createWriteStream(storagePath));
    const stat = await fs.promises.stat(storagePath);
    const [oldAsset] = await db.select().from(releaseAssetsTable).where(and(eq(releaseAssetsTable.releaseId, id), eq(releaseAssetsTable.platform, platform))).limit(1);
    if (oldAsset) {
      await db.delete(releaseAssetsTable).where(eq(releaseAssetsTable.id, oldAsset.id));
      if (oldAsset.storagePath !== storagePath) await fs.promises.rm(oldAsset.storagePath, { force: true });
    }
    const [asset] = await db.insert(releaseAssetsTable).values({
      releaseId: id, platform, fileName, contentType, sizeBytes: stat.size, storagePath, downloadUrl: null,
    }).returning();
    await audit(req, "release.asset_uploaded", "release_asset", asset.id, `Uploaded ${platform} package for Violet ${release.version}`, { fileName, sizeBytes: stat.size });
    res.status(201).json({ ...asset, createdAt: asset.createdAt.toISOString() });
  } catch (error) {
    await fs.promises.rm(storagePath, { force: true });
    req.log.error({ err: error, releaseId: id, platform }, "Release asset upload failed");
    res.status(500).json({ error: "Unable to store the release package." });
  }
});

router.patch("/admin/releases/:id/assets/:platform", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const platform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
  if (!validPlatform(platform)) { res.status(400).json({ error: "Invalid release platform." }); return; }
  if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, "downloadUrl")) {
    res.status(400).json({ error: "Provide a secure HTTPS download URL, or null to clear it." });
    return;
  }
  const rawUrl = req.body.downloadUrl;
  if (rawUrl !== null && rawUrl !== "" && !validDownloadUrl(rawUrl)) {
    res.status(400).json({ error: "Download URL must be a valid HTTPS URL no longer than 2048 characters." });
    return;
  }
  const downloadUrl = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : null;
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, id)).limit(1);
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }
  const [existing] = await db.select().from(releaseAssetsTable)
    .where(and(eq(releaseAssetsTable.releaseId, id), eq(releaseAssetsTable.platform, platform))).limit(1);

  const [asset] = existing
    ? await db.update(releaseAssetsTable).set({ downloadUrl }).where(eq(releaseAssetsTable.id, existing.id)).returning()
    : await db.insert(releaseAssetsTable).values({
      releaseId: id,
      platform,
      fileName: `${platform}-external-download`,
      contentType: "text/uri-list",
      sizeBytes: 0,
      storagePath: "",
      downloadUrl,
    }).returning();

  await audit(
    req,
    "release.asset_link_updated",
    "release_asset",
    asset.id,
    `${downloadUrl ? "Set" : "Cleared"} ${platform} download link for Violet ${release.version}`,
    { platform, downloadUrl },
  );
  res.json({ ...asset, createdAt: asset.createdAt.toISOString() });
});

router.get("/admin/releases/:id/assets/:platform", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const platform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
  const [asset] = await db.select().from(releaseAssetsTable).where(and(eq(releaseAssetsTable.releaseId, id), eq(releaseAssetsTable.platform, platform))).limit(1);
  if (!asset) { res.status(404).json({ error: "Release package not found" }); return; }
  if (asset.downloadUrl) { res.redirect(asset.downloadUrl); return; }
  if (!fs.existsSync(asset.storagePath)) { res.status(404).json({ error: "Release package not found" }); return; }
  res.setHeader("Content-Type", asset.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(asset.fileName)}"`);
  res.setHeader("Content-Length", asset.sizeBytes);
  fs.createReadStream(asset.storagePath).pipe(res);
});

router.get("/releases/latest", async (req, res): Promise<void> => {
  const channel = typeof req.query.channel === "string" ? req.query.channel : "stable";
  const [release] = await db.select().from(releasesTable)
    .where(and(eq(releasesTable.status, "published"), eq(releasesTable.channel, channel)))
    .orderBy(desc(releasesTable.publishedAt)).limit(1);
  if (!release) { res.status(404).json({ error: "No published release is available." }); return; }
  const assets = await db.select().from(releaseAssetsTable).where(eq(releaseAssetsTable.releaseId, release.id));
  res.json({
    id: release.id, version: release.version, channel: release.channel, releaseNotes: release.releaseNotes ?? "",
    publishedAt: release.publishedAt?.toISOString() ?? null,
    assets: assets.filter(asset => asset.downloadUrl || fs.existsSync(asset.storagePath)).map(asset => ({
      platform: asset.platform, fileName: asset.fileName, sizeBytes: asset.sizeBytes,
      downloadUrl: asset.downloadUrl ?? `/api/releases/${release.id}/assets/${asset.platform}`,
    })),
  });
});

router.get("/releases/:id/assets/:platform", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const platform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
  const [release] = await db.select().from(releasesTable).where(and(eq(releasesTable.id, id), eq(releasesTable.status, "published"))).limit(1);
  const [asset] = await db.select().from(releaseAssetsTable).where(and(eq(releaseAssetsTable.releaseId, id), eq(releaseAssetsTable.platform, platform))).limit(1);
  if (!release || !asset) { res.status(404).json({ error: "Published release package not found." }); return; }
  if (asset.downloadUrl) { res.redirect(asset.downloadUrl); return; }
  if (!fs.existsSync(asset.storagePath)) { res.status(404).json({ error: "Published release package not found." }); return; }
  res.setHeader("Content-Type", asset.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(asset.fileName)}"`);
  res.setHeader("Content-Length", asset.sizeBytes);
  fs.createReadStream(asset.storagePath).pipe(res);
});

// ─── Helper: resolve plan from subscription (authoritative) then tenant fallback
async function resolvePlan(subscription: { planId: string } | null, tenant: { planId: string | null }) {
  const planId = subscription?.planId ?? tenant.planId;
  if (!planId) return null;
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1);
  return plan ?? null;
}

// GET /admin/stats
router.get("/admin/stats", requireSuperAdmin, async (req, res): Promise<void> => {
  const [tenantStats, planStats] = await Promise.all([
    db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${tenantsTable.status} = 'active' THEN 1 ELSE 0 END)`,
      trial: sql<number>`SUM(CASE WHEN ${tenantsTable.status} = 'trial' THEN 1 ELSE 0 END)`,
      suspended: sql<number>`SUM(CASE WHEN ${tenantsTable.status} = 'suspended' THEN 1 ELSE 0 END)`,
    }).from(tenantsTable),
    db.select({
      planName: plansTable.name,
      count: sql<number>`COUNT(${subscriptionsTable.id})`,
      price: plansTable.price,
      billingType: plansTable.billingType,
    }).from(plansTable)
      .leftJoin(subscriptionsTable, eq(subscriptionsTable.planId, plansTable.id))
      .groupBy(plansTable.id),
  ]);

  const stats = tenantStats[0];
  const totalTenants = Number(stats?.total ?? 0);
  const activeTenants = Number(stats?.active ?? 0);
  const trialTenants = Number(stats?.trial ?? 0);
  const suspendedTenants = Number(stats?.suspended ?? 0);

  const mrr = planStats.reduce((sum, p) => {
    if (p.billingType === "monthly") return sum + parseFloat(p.price) * Number(p.count);
    return sum;
  }, 0);

  const revenueByPlan = planStats.map(p => ({
    planName: p.planName,
    tenantCount: Number(p.count),
    revenue: parseFloat(p.price) * Number(p.count),
  }));

  res.json({
    totalTenants,
    activeTenants,
    trialTenants,
    suspendedTenants,
    mrr,
    arr: mrr * 12,
    newTenantsThisMonth: 0,
    churnRate: 0,
    totalRevenue: mrr,
    revenueByPlan,
  });
});

// GET /admin/tenants
router.get("/admin/tenants", requireSuperAdmin, async (req, res): Promise<void> => {
  const { search, status, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(tenantsTable.status, status) as any);
  if (search) conditions.push(ilike(tenantsTable.name, `%${search}%`) as any);

  // 1. Fetch tenants page + total — 2 queries
  const [tenants, [{ total }]] = await Promise.all([
    db.select().from(tenantsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limitNum).offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(tenantsTable)
      .where(conditions.length ? and(...conditions) : undefined),
  ]);

  if (tenants.length === 0) {
    res.json({ data: [], total: Number(total), page: pageNum, limit: limitNum });
    return;
  }

  const tenantIds = tenants.map(t => t.id);

  // 2. Batch aggregate queries — 3 queries, all grouped by tenantId
  const [userCounts, productCounts, customerCounts, subscriptions] = await Promise.all([
    db.select({
      tenantId: usersTable.tenantId,
      count: sql<number>`COUNT(*)`,
    }).from(usersTable).where(inArray(usersTable.tenantId, tenantIds))
      .groupBy(usersTable.tenantId),
    db.select({
      tenantId: productsTable.tenantId,
      count: sql<number>`COUNT(*)`,
    }).from(productsTable).where(inArray(productsTable.tenantId, tenantIds))
      .groupBy(productsTable.tenantId),
    db.select({
      tenantId: customersTable.tenantId,
      count: sql<number>`COUNT(*)`,
    }).from(customersTable).where(inArray(customersTable.tenantId, tenantIds))
      .groupBy(customersTable.tenantId),
    db.select().from(subscriptionsTable)
      .where(inArray(subscriptionsTable.tenantId, tenantIds)),
  ]);

  // Build lookup maps
  const userCountByTenant = new Map(userCounts.map(r => [r.tenantId, Number(r.count)]));
  const productCountByTenant = new Map(productCounts.map(r => [r.tenantId, Number(r.count)]));
  const customerCountByTenant = new Map(customerCounts.map(r => [r.tenantId, Number(r.count)]));
  const subByTenant = new Map(subscriptions.map(s => [s.tenantId, s]));

  // 3. Collect all unique planIds to fetch in one query
  const planIdSet = new Set<string>();
  for (const t of tenants) {
    const sub = subByTenant.get(t.id);
    const planId = sub?.planId ?? t.planId;
    if (planId) planIdSet.add(planId);
  }

  const plans = planIdSet.size > 0
    ? await db.select().from(plansTable).where(inArray(plansTable.id, [...planIdSet]))
    : [];
  const planById = new Map(plans.map(p => [p.id, p]));

  // 4. Assemble response in memory — no further DB calls
  const result = tenants.map(t => {
    const sub = subByTenant.get(t.id) ?? null;
    const planId = sub?.planId ?? t.planId;
    const plan = planId ? planById.get(planId) ?? null : null;

    return {
      id: t.id,
      name: t.name,
      email: t.email,
      status: t.status,
      planId: plan?.id ?? t.planId ?? "",
      planName: plan?.name ?? "Free",
      planTier: plan?.tier ?? "free",
      billingType: plan?.billingType ?? "one_time",
      userCount: userCountByTenant.get(t.id) ?? 0,
      productCount: productCountByTenant.get(t.id) ?? 0,
      customerCount: customerCountByTenant.get(t.id) ?? 0,
      subscriptionStatus: sub?.status ?? null,
      subscriptionStart: sub?.currentPeriodStart?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  });

  res.json({ data: result, total: Number(total), page: pageNum, limit: limitNum });
});

// GET /admin/tenants/:id  — full detail with plan limits and usage
router.get("/admin/tenants/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [
    [{ userCount }],
    [{ productCount }],
    [{ customerCount }],
    subscription,
  ] = await Promise.all([
    db.select({ userCount: sql<number>`COUNT(*)` })
      .from(usersTable).where(eq(usersTable.tenantId, tenant.id)),
    db.select({ productCount: sql<number>`COUNT(*)` })
      .from(productsTable).where(eq(productsTable.tenantId, tenant.id)),
    db.select({ customerCount: sql<number>`COUNT(*)` })
      .from(customersTable).where(eq(customersTable.tenantId, tenant.id)),
    db.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenant.id)).limit(1)
      .then(r => r[0] ?? null),
  ]);

  // Subscription is authoritative for plan — fall back to tenant.planId for legacy rows
  const plan = await resolvePlan(subscription, tenant);

  res.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    status: tenant.status,
    planId: plan?.id ?? tenant.planId ?? "",
    planName: plan?.name ?? "Free",
    planTier: plan?.tier ?? "free",
    billingType: plan?.billingType ?? "one_time",
    userCount: Number(userCount),
    productCount: Number(productCount),
    customerCount: Number(customerCount),
    subscriptionStatus: subscription?.status ?? null,
    subscriptionStart: subscription?.currentPeriodStart?.toISOString() ?? null,
    subscriptionEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    maxUsers: plan?.maxUsers ?? 2,
    maxProducts: plan?.maxProducts ?? 250,
    maxCustomers: plan?.maxCustomers ?? 500,
    maxBranches: plan?.maxBranches ?? 1,
    createdAt: tenant.createdAt.toISOString(),
  });
});

// PATCH /admin/tenants/:id
router.patch("/admin/tenants/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status, planId } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (planId !== undefined) updates.planId = planId;

  const [tenant] = await db.update(tenantsTable).set(updates)
    .where(eq(tenantsTable.id, id)).returning();
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  await audit(req, "tenant.updated", "tenant", id, `Updated ${tenant.name} tenant account`, updates);

  // Fetch subscription to use as authoritative plan source
  const subscription = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenant.id)).limit(1)
    .then(r => r[0] ?? null);
  const plan = await resolvePlan(subscription, tenant);

  res.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    status: tenant.status,
    planId: plan?.id ?? tenant.planId ?? "",
    planName: plan?.name ?? "Free",
    planTier: plan?.tier ?? "free",
    billingType: plan?.billingType ?? "one_time",
    userCount: 0,
    productCount: 0,
    customerCount: 0,
    subscriptionStatus: subscription?.status ?? null,
    subscriptionStart: subscription?.currentPeriodStart?.toISOString() ?? null,
    createdAt: tenant.createdAt.toISOString(),
  });
});

// GET /admin/plans
router.get("/admin/plans", requireSuperAdmin, async (req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.price);
  res.json(plans.map(publicPlan));
});

// POST /admin/plans
router.post("/admin/plans", requireSuperAdmin, async (req, res): Promise<void> => {
  const { name, tier, description, price, annualPrice, billingType, currency, whopPlanId, maxUsers, maxRegisters, maxBranches, maxProducts, maxCustomers, features, trialDays, isPopular } = req.body;
  if (!name || !tier || price === undefined || !billingType) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const [plan] = await db.insert(plansTable).values({
    name, tier, description, price: String(price),
    annualPrice: annualPrice ? String(annualPrice) : undefined,
    billingType, currency: currency ?? "USD", whopPlanId: whopPlanId || undefined, maxUsers, maxRegisters, maxBranches, maxProducts, maxCustomers,
    features: features ?? [], trialDays: trialDays ?? 0, isPopular: isPopular ?? false,
  }).returning();
  await audit(req, "plan.created", "plan", plan.id, `Created ${plan.name} plan`);
  res.status(201).json(publicPlan(plan));
});

// PATCH /admin/plans/:id
router.patch("/admin/plans/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, description, price, annualPrice, currency, whopPlanId, maxUsers, maxRegisters, maxBranches, maxProducts, maxCustomers, features, isActive, isPopular, trialDays } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = String(price);
  if (annualPrice !== undefined) updates.annualPrice = annualPrice ? String(annualPrice) : null;
  if (currency !== undefined) updates.currency = currency;
  if (whopPlanId !== undefined) updates.whopPlanId = whopPlanId || null;
  if (maxUsers !== undefined) updates.maxUsers = maxUsers;
  if (maxRegisters !== undefined) updates.maxRegisters = maxRegisters;
  if (maxBranches !== undefined) updates.maxBranches = maxBranches;
  if (maxProducts !== undefined) updates.maxProducts = maxProducts;
  if (maxCustomers !== undefined) updates.maxCustomers = maxCustomers;
  if (features !== undefined) updates.features = features;
  if (isActive !== undefined) updates.isActive = isActive;
  if (isPopular !== undefined) updates.isPopular = isPopular;
  if (trialDays !== undefined) updates.trialDays = trialDays;

  const [plan] = await db.update(plansTable).set(updates).where(eq(plansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  await audit(req, "plan.updated", "plan", id, `Updated ${plan.name} plan`, updates);
  res.json(publicPlan(plan));
});

// ─── Billing visibility and verified provider reporting ───────────────────────
router.get("/admin/billing", requireSuperAdmin, async (req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.price);
  const companyId = process.env.WHOP_COMPANY_ID;
  const envByTier = { starter: "WHOP_PLAN_STARTER", professional: "WHOP_PLAN_PROFESSIONAL", enterprise: "WHOP_PLAN_ENTERPRISE" } as const;
  const whopPlans: Record<string, unknown> = {};
  let providerStatus = companyId ? "configured" : "not_configured";
  if (companyId) {
    try {
      const client = await getWhopClient();
      await Promise.all(Object.entries(envByTier).map(async ([tier, envName]) => {
        const id = process.env[envName];
        if (!id) return;
        try {
          const plan = await client.plans.retrieve({ id });
          whopPlans[tier] = {
            id, title: plan.title ?? null, currency: plan.currency ?? null,
            initialPrice: plan.initial_price ?? null, renewalPrice: plan.renewal_price ?? null,
            billingPeriod: plan.billing_period ?? null, visibility: plan.visibility ?? null,
          };
        } catch {
          whopPlans[tier] = { id, error: "Unable to retrieve this Whop offer" };
        }
      }));
    } catch {
      providerStatus = "unavailable";
    }
  }
  res.json({ provider: "Whop", providerStatus, companyConfigured: Boolean(companyId), plans: plans.map(plan => ({
    local: publicPlan(plan),
    whop: whopPlans[plan.tier] ?? (plan.whopPlanId
      ? { id: plan.whopPlanId }
      : envByTier[plan.tier as keyof typeof envByTier]
        ? { id: process.env[envByTier[plan.tier as keyof typeof envByTier]] ?? null }
        : null),
  })) });
});

router.get("/admin/sales", requireSuperAdmin, async (req, res): Promise<void> => {
  const { startDate, endDate, tenantId, paymentMethod, status, search, page = "1", limit = "50", format } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const conditions = [];
  if (startDate && !Number.isNaN(Date.parse(startDate))) conditions.push(gte(salesTable.createdAt, new Date(startDate)));
  if (endDate && !Number.isNaN(Date.parse(endDate))) conditions.push(lte(salesTable.createdAt, new Date(endDate)));
  if (tenantId) conditions.push(eq(salesTable.tenantId, tenantId));
  if (paymentMethod) conditions.push(eq(salesTable.paymentMethod, paymentMethod));
  if (status) conditions.push(eq(salesTable.status, status));
  if (search) conditions.push(ilike(tenantsTable.name, `%${search}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }], [{ revenue }]] = await Promise.all([
    db.select({
      id: salesTable.id, receiptNumber: salesTable.receiptNumber, tenantId: salesTable.tenantId,
      tenantName: tenantsTable.name, paymentMethod: salesTable.paymentMethod, status: salesTable.status,
      totalAmount: salesTable.totalAmount, createdAt: salesTable.createdAt, cashierName: usersTable.firstName,
      currency: settingsTable.currency,
    }).from(salesTable).leftJoin(tenantsTable, eq(salesTable.tenantId, tenantsTable.id))
      .leftJoin(usersTable, eq(salesTable.cashierId, usersTable.id))
      .leftJoin(settingsTable, eq(salesTable.tenantId, settingsTable.tenantId)).where(where)
      .orderBy(desc(salesTable.createdAt)).limit(limitNum).offset((pageNum - 1) * limitNum),
    db.select({ total: sql<number>`COUNT(*)` }).from(salesTable).leftJoin(tenantsTable, eq(salesTable.tenantId, tenantsTable.id)).where(where),
    db.select({ revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}::numeric) FILTER (WHERE ${salesTable.status} = 'completed'), 0)` }).from(salesTable).leftJoin(tenantsTable, eq(salesTable.tenantId, tenantsTable.id)).where(where),
  ]);
  const data = rows.map(row => ({
    ...row, totalAmount: parseFloat(row.totalAmount), currency: row.currency ?? "JMD", createdAt: row.createdAt.toISOString(),
    cashierName: [row.cashierName].filter(Boolean).join(" ") || "—",
  }));
  if (format === "csv") {
    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = ["Receipt,Tenant,Amount,Payment method,Status,Cashier,Created at", ...data.map(row => [
      row.receiptNumber, row.tenantName, row.totalAmount, row.paymentMethod, row.status, row.cashierName, row.createdAt,
    ].map(csvEscape).join(","))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="violet-platform-sales.csv"');
    res.send(lines.join("\n"));
    return;
  }
  res.json({ data, total: Number(total), page: pageNum, limit: limitNum, summary: { revenue: parseFloat(String(revenue ?? 0)), orders: Number(total) } });
});

router.get("/admin/audit", requireSuperAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const logs = await db.select({
    id: platformAuditLogsTable.id, action: platformAuditLogsTable.action, entityType: platformAuditLogsTable.entityType,
    entityId: platformAuditLogsTable.entityId, summary: platformAuditLogsTable.summary,
    metadata: platformAuditLogsTable.metadata, createdAt: platformAuditLogsTable.createdAt,
    actorEmail: usersTable.email, actorFirstName: usersTable.firstName, actorLastName: usersTable.lastName,
  }).from(platformAuditLogsTable).leftJoin(usersTable, eq(platformAuditLogsTable.actorId, usersTable.id))
    .orderBy(desc(platformAuditLogsTable.createdAt)).limit(limit);
  res.json(logs.map(log => ({
    ...log, createdAt: log.createdAt.toISOString(),
    actorName: [log.actorFirstName, log.actorLastName].filter(Boolean).join(" ") || log.actorEmail || "Unknown",
  })));
});

export default router;
