import React, { useState } from "react";
import {
  useGetAdminStats,
  useListTenants,
  useGetAdminTenant,
  useUpdateAdminTenant,
  useListAdminPlans,
  useCreateAdminPlan,
  useUpdateAdminPlan,
} from "@workspace/api-client-react";
import type {
  Plan, PlanInput, PlanUpdate, TenantUpdateStatus, TenantDetail,
} from "@workspace/api-client-react";
import { getGetAdminTenantQueryOptions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  Search, ShieldAlert, Building2, TrendingUp, Users,
  Plus, Edit2, CheckCircle2, XCircle, Star, AlertTriangle,
  Package, UserCog, ShoppingBag, CalendarDays, CreditCard,
  PauseCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanFormData = {
  name: string;
  tier: string;
  description: string;
  price: string;
  annualPrice: string;
  billingType: string;
  maxUsers: string;
  maxRegisters: string;
  maxBranches: string;
  maxProducts: string;
  maxCustomers: string;
  trialDays: string;
  isActive: boolean;
  isPopular: boolean;
  features: string[];
};

const EMPTY_FORM: PlanFormData = {
  name: "",
  tier: "starter",
  description: "",
  price: "0",
  annualPrice: "",
  billingType: "monthly",
  maxUsers: "5",
  maxRegisters: "2",
  maxBranches: "1",
  maxProducts: "2000",
  maxCustomers: "2000",
  trialDays: "0",
  isActive: true,
  isPopular: false,
  features: [],
};

function planToForm(p: Plan): PlanFormData {
  return {
    name: p.name,
    tier: p.tier,
    description: p.description ?? "",
    price: String(p.price),
    annualPrice: p.annualPrice != null ? String(p.annualPrice) : "",
    billingType: p.billingType ?? "monthly",
    maxUsers: String(p.maxUsers ?? 2),
    maxRegisters: String(p.maxRegisters ?? 1),
    maxBranches: String(p.maxBranches ?? 1),
    maxProducts: String(p.maxProducts ?? 500),
    maxCustomers: String(p.maxCustomers ?? 500),
    trialDays: String(p.trialDays ?? 0),
    isActive: p.isActive,
    isPopular: p.isPopular ?? false,
    features: p.features ?? [],
  };
}

// ── Usage progress bar ────────────────────────────────────────────────────────

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color =
    pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Tenant detail drawer ──────────────────────────────────────────────────────

interface TenantDetailDrawerProps {
  tenantId: string | null;
  onClose: () => void;
  onStatusChange: (id: string, currentStatus: string) => void;
  statusChangePending: boolean;
}

function TenantDetailDrawer({
  tenantId, onClose, onStatusChange, statusChangePending,
}: TenantDetailDrawerProps) {
  const { data: tenant, isLoading } = useGetAdminTenant(tenantId ?? "", {
    query: { ...getGetAdminTenantQueryOptions(tenantId ?? ""), enabled: !!tenantId },
  });

  const statusColor: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    trial: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    expired: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    cancelled: "bg-muted text-muted-foreground",
  };

  const tierColor: Record<string, string> = {
    free: "bg-muted text-muted-foreground",
    starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    professional: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    lifetime: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };

  return (
    <Sheet open={!!tenantId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {isLoading ? "Loading…" : (tenant?.name ?? "Tenant")}
          </SheetTitle>
          <SheetDescription>
            Platform account details, subscription, and usage
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        ) : tenant ? (
          <div className="space-y-6">

            {/* Account info */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Account
              </h3>
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Business name</span>
                  <span className="font-medium">{tenant.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{tenant.email || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registered</span>
                  <span className="font-medium">{formatDate(tenant.createdAt)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      tenant.status === "active" ? "success"
                        : tenant.status === "suspended" ? "destructive"
                        : "secondary"
                    }
                    className="uppercase text-[10px]"
                  >
                    {tenant.status}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            {/* Subscription */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Subscription
              </h3>
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Plan</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tenant.planName ?? "Free"}</span>
                    {tenant.planTier && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${tierColor[tenant.planTier] ?? "bg-muted text-muted-foreground"}`}>
                        {tenant.planTier}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing</span>
                  <span className="font-medium capitalize">
                    {(tenant.billingType ?? "one_time").replace("_", " ")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Sub. status</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor[tenant.subscriptionStatus ?? "active"] ?? "bg-muted text-muted-foreground"}`}>
                    {tenant.subscriptionStatus ?? "active"}
                  </span>
                </div>
                {tenant.subscriptionStart && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start date</span>
                    <span className="font-medium">{formatDate(tenant.subscriptionStart)}</span>
                  </div>
                )}
                {tenant.subscriptionEnd && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Renewal / end</span>
                    <span className="font-medium">{formatDate(tenant.subscriptionEnd)}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Usage */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5" /> Usage vs Plan limits
              </h3>
              <div className="rounded-lg border p-4 space-y-4">
                <UsageBar
                  label="Users"
                  used={tenant.userCount ?? 0}
                  max={tenant.maxUsers ?? 2}
                />
                <UsageBar
                  label="Products"
                  used={tenant.productCount ?? 0}
                  max={tenant.maxProducts ?? 250}
                />
                <UsageBar
                  label="Customers"
                  used={tenant.customerCount ?? 0}
                  max={tenant.maxCustomers ?? 500}
                />
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Actions
              </h3>
              <Button
                variant={tenant.status === "suspended" ? "default" : "destructive"}
                className="w-full gap-2"
                disabled={statusChangePending}
                onClick={() => onStatusChange(tenant.id, tenant.status)}
              >
                {tenant.status === "suspended" ? (
                  <><CheckCircle2 className="w-4 h-4" /> Activate account</>
                ) : (
                  <><PauseCircle className="w-4 h-4" /> Suspend account</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {tenant.status === "suspended"
                  ? "Activating restores the tenant's access to Violet."
                  : "Suspending blocks all logins for this tenant's users."}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tenant not found.</p>
        )}

        <SheetFooter className="mt-6">
          <SheetClose asChild>
            <Button variant="outline" className="w-full">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Plan Editor Sheet ─────────────────────────────────────────────────────────

interface PlanEditorProps {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  allPlans: Plan[];
}

function PlanEditor({ open, onClose, plan, allPlans }: PlanEditorProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlanFormData>(plan ? planToForm(plan) : EMPTY_FORM);

  React.useEffect(() => {
    setForm(plan ? planToForm(plan) : EMPTY_FORM);
  }, [plan?.id, open]);

  const createPlan = useCreateAdminPlan({
    mutation: {
      onSuccess: () => {
        toast.success("Plan created successfully");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
        queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message || "Failed to create plan"),
    },
  });

  const updatePlan = useUpdateAdminPlan({
    mutation: {
      onSuccess: () => {
        toast.success("Plan updated");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
        queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message || "Failed to update plan"),
    },
  });

  const isPending = createPlan.isPending || updatePlan.isPending;

  const otherPopularPlans = allPlans.filter(p => p.isPopular && p.id !== plan?.id);
  const multiplePopularWarning = form.isPopular && otherPopularPlans.length > 0;

  const setField = <K extends keyof PlanFormData>(k: K, v: PlanFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleFeature = (value: string) => {
    setForm(f => ({
      ...f,
      features: f.features.includes(value)
        ? f.features.filter(x => x !== value)
        : [...f.features, value],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (plan) {
      const updatePayload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price: parseFloat(form.price) || 0,
        annualPrice: form.annualPrice !== "" ? parseFloat(form.annualPrice) : null,
        maxUsers: parseInt(form.maxUsers, 10) || 1,
        maxRegisters: parseInt(form.maxRegisters, 10) || 1,
        maxBranches: parseInt(form.maxBranches, 10) || 1,
        maxProducts: parseInt(form.maxProducts, 10) || 1,
        maxCustomers: parseInt(form.maxCustomers, 10) || 1,
        trialDays: parseInt(form.trialDays, 10) || 0,
        isActive: form.isActive,
        isPopular: form.isPopular,
        features: form.features,
      } satisfies Omit<PlanUpdate, "annualPrice"> & { annualPrice: number | null };
      updatePlan.mutate({ id: plan.id, data: updatePayload as unknown as PlanUpdate });
    } else {
      const createPayload: PlanInput = {
        name: form.name.trim(),
        tier: form.tier as PlanInput["tier"],
        description: form.description.trim() || undefined,
        price: parseFloat(form.price) || 0,
        annualPrice: form.annualPrice !== "" ? parseFloat(form.annualPrice) : undefined,
        billingType: form.billingType as PlanInput["billingType"],
        maxUsers: parseInt(form.maxUsers, 10) || 1,
        maxRegisters: parseInt(form.maxRegisters, 10) || 1,
        maxBranches: parseInt(form.maxBranches, 10) || 1,
        maxProducts: parseInt(form.maxProducts, 10) || 1,
        maxCustomers: parseInt(form.maxCustomers, 10) || 1,
        trialDays: parseInt(form.trialDays, 10) || 0,
        isPopular: form.isPopular,
        features: form.features,
      };
      createPlan.mutate({ data: createPayload });
    }
  };

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{plan ? `Edit plan: ${plan.name}` : "New plan"}</SheetTitle>
          <SheetDescription>
            {plan
              ? "Changes are applied immediately. All tenants on this plan see the update on their next page load."
              : "Create a new subscription tier. You can edit all fields after creation."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Plan identity</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">Name *</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={e => setField("name", e.target.value)}
                  placeholder="e.g. Professional"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                {plan ? (
                  <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm capitalize text-muted-foreground">
                    {plan.tier}
                    <span className="ml-auto text-xs opacity-60">locked</span>
                  </div>
                ) : (
                  <Select value={form.tier} onValueChange={v => setField("tier", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                      <SelectItem value="lifetime">Lifetime</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-desc">Description</Label>
              <Textarea
                id="plan-desc"
                value={form.description}
                onChange={e => setField("description", e.target.value)}
                placeholder="Short description shown on the pricing page"
                rows={2}
              />
            </div>
          </div>

          <Separator />

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pricing</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Billing type</Label>
                {plan ? (
                  <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm capitalize text-muted-foreground">
                    {plan.billingType?.replace("_", " ") ?? "—"}
                    <span className="ml-auto text-xs opacity-60">locked</span>
                  </div>
                ) : (
                  <Select value={form.billingType} onValueChange={v => setField("billingType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_time">One-time (lifetime)</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-price">Price ($) *</Label>
                <Input
                  id="plan-price"
                  type="number" min="0" step="0.01"
                  value={form.price}
                  onChange={e => setField("price", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-annual">
                Annual price ($) <span className="text-muted-foreground font-normal">optional</span>
              </Label>
              <Input
                id="plan-annual"
                type="number" min="0" step="0.01"
                value={form.annualPrice}
                onChange={e => setField("annualPrice", e.target.value)}
                placeholder="Leave blank if not offered"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-trial">Trial days</Label>
              <Input
                id="plan-trial"
                type="number" min="0"
                value={form.trialDays}
                onChange={e => setField("trialDays", e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Limits */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              {([
                { key: "maxUsers", label: "Max users" },
                { key: "maxRegisters", label: "Max registers" },
                { key: "maxBranches", label: "Max branches" },
                { key: "maxProducts", label: "Max products" },
                { key: "maxCustomers", label: "Max customers" },
              ] as const).map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`plan-${key}`}>{label}</Label>
                  <Input
                    id={`plan-${key}`}
                    type="number" min="0"
                    value={form[key]}
                    onChange={e => setField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Features */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Features included</h3>
            <div className="space-y-3">
              {FEATURE_FLAGS.map(flag => (
                <label key={flag.value} className="flex items-start gap-3 cursor-pointer group">
                  <Checkbox
                    id={`flag-${flag.value}`}
                    checked={form.features.includes(flag.value)}
                    onCheckedChange={() => toggleFeature(flag.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium leading-none group-hover:text-primary transition-colors">
                      {flag.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{flag.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* Visibility */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Visibility</h3>
            {plan && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Active plan</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Inactive plans are hidden from the public pricing page</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={v => setField("isActive", v)} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Most Popular badge
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Highlights this plan on the pricing page</p>
              </div>
              <Switch checked={form.isPopular} onCheckedChange={v => setField("isPopular", v)} />
            </div>
            {multiplePopularWarning && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-sm">
                  <strong>{otherPopularPlans.map(p => p.name).join(", ")}</strong>{" "}
                  {otherPopularPlans.length === 1 ? "is" : "are"} also marked as Popular.
                  Consider removing the badge from the other plan so only one is highlighted.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <SheetFooter className="pt-2 gap-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>Cancel</Button>
            </SheetClose>
            <Button type="submit" disabled={isPending || !form.name.trim()}>
              {isPending ? "Saving…" : plan ? "Save changes" : "Create plan"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Plans Tab ─────────────────────────────────────────────────────────────────

function PlansTab() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const { data: plans = [], isLoading } = useListAdminPlans();
  const popularCount = plans.filter(p => p.isPopular).length;

  const tierColor: Record<string, string> = {
    free: "bg-muted text-muted-foreground",
    starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    professional: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    lifetime: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };

  return (
    <div className="space-y-6">
      {popularCount > 1 && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription>
            <strong>{popularCount} plans</strong> are currently marked as "Most Popular". Only one
            plan should have this badge — edit the plans to resolve this.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {plans.length} plan{plans.length !== 1 ? "s" : ""} configured · changes reflect immediately on the pricing page
        </p>
        <Button onClick={() => { setEditingPlan(null); setEditorOpen(true); }} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> New plan
        </Button>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Limits</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Loading plans…</TableCell>
              </TableRow>
            ) : plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No plans found. Create one to get started.</TableCell>
              </TableRow>
            ) : (
              plans.map(plan => (
                <TableRow key={plan.id} className="group">
                  <TableCell>
                    <div className="font-medium flex items-center gap-1.5">
                      {plan.name}
                      {plan.isPopular && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    </div>
                    <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mt-0.5 ${tierColor[plan.tier] ?? "bg-muted text-muted-foreground"}`}>
                      {plan.tier}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {plan.billingType?.replace("_", " ") ?? "—"}
                    {(plan.trialDays ?? 0) > 0 && (
                      <div className="text-xs text-primary">{plan.trialDays}d trial</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{formatCurrency(plan.price)}</div>
                    {plan.annualPrice != null && (
                      <div className="text-xs text-muted-foreground">{formatCurrency(plan.annualPrice)}/yr</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-0.5 text-muted-foreground">
                      <div>{plan.maxProducts?.toLocaleString()} products</div>
                      <div>{plan.maxUsers} users · {plan.maxBranches} branch{(plan.maxBranches ?? 1) !== 1 ? "es" : ""}</div>
                      <div>{plan.maxCustomers?.toLocaleString()} customers</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-48">
                      {(plan.features ?? []).length === 0 ? (
                        <span className="text-xs text-muted-foreground">Basic only</span>
                      ) : (
                        (plan.features ?? []).slice(0, 3).map(f => {
                          const flag = FEATURE_FLAGS.find(ff => ff.value === f);
                          return (
                            <span key={f} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                              {flag?.label ?? f}
                            </span>
                          );
                        })
                      )}
                      {(plan.features ?? []).length > 3 && (
                        <span className="text-[10px] text-muted-foreground px-1">
                          +{(plan.features ?? []).length - 3} more
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {plan.isActive ? (
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-medium">Active</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <XCircle className="w-4 h-4" />
                        <span className="text-xs font-medium">Inactive</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setEditingPlan(plan); setEditorOpen(true); }}
                      className="gap-2"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <PlanEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        plan={editingPlan}
        allPlans={plans}
      />
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: tenantsData, isLoading: tenantsLoading } = useListTenants({ search });

  const tenants = tenantsData?.data || [];

  const updateTenant = useUpdateAdminTenant({
    mutation: {
      onSuccess: () => {
        toast.success("Tenant status updated");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        // Re-fetch the detail drawer if it's open
        if (selectedTenantId) {
          queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${selectedTenantId}`] });
        }
      },
      onError: (e: Error) => toast.error(e.message || "Failed to update tenant"),
    },
  });

  const handleStatusChange = (id: string, currentStatus: string) => {
    const newStatus: TenantUpdateStatus = currentStatus === "suspended" ? "active" : "suspended";
    if (confirm(`Are you sure you want to ${newStatus === "suspended" ? "suspend" : "activate"} this account?`)) {
      updateTenant.mutate({ id, data: { status: newStatus } });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border/50">
        <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Super Admin Portal</h1>
          <p className="text-muted-foreground mt-1">Platform overview, tenant management, and plan configuration</p>
        </div>
      </div>

      {/* Stats strip — 4 cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Monthly MRR</p>
              <div className="text-2xl font-bold">
                {statsLoading ? "…" : formatCurrency(stats?.mrr || 0)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active</p>
              <div className="text-2xl font-bold">
                {statsLoading ? "…" : (stats?.activeTenants ?? 0)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <CalendarDays className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Trial</p>
              <div className="text-2xl font-bold">
                {statsLoading ? "…" : (stats?.trialTenants ?? 0)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <PauseCircle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Suspended</p>
              <div className="text-2xl font-bold">
                {statsLoading ? "…" : (stats?.suspendedTenants ?? 0)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tenants">
        <TabsList className="mb-6">
          <TabsTrigger value="tenants" className="gap-2">
            <Users className="w-4 h-4" /> Tenants
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2">
            <Package className="w-4 h-4" /> Plans &amp; Features
          </TabsTrigger>
        </TabsList>

        {/* ── Tenants tab ── */}
        <TabsContent value="tenants">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Registered Tenants</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by business name…"
                  className="pl-9 h-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <UserCog className="w-3.5 h-3.5" /> Users
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5" /> Products
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> Customers
                        </div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          Loading tenants…
                        </TableCell>
                      </TableRow>
                    ) : tenants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          No tenants found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tenants.map(tenant => (
                        <TableRow
                          key={tenant.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedTenantId(tenant.id)}
                        >
                          <TableCell>
                            <div className="font-medium">{tenant.name}</div>
                            <div className="text-xs text-muted-foreground">{tenant.email || "No email"}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{tenant.planName}</Badge>
                            {tenant.subscriptionStatus && tenant.subscriptionStatus !== "active" && (
                              <div className="text-[10px] text-amber-600 mt-0.5 capitalize">{tenant.subscriptionStatus}</div>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {(tenant.userCount ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {(tenant.productCount ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {(tenant.customerCount ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                tenant.status === "active" ? "success"
                                  : tenant.status === "suspended" ? "destructive"
                                  : "secondary"
                              }
                              className="uppercase text-[10px]"
                            >
                              {tenant.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(tenant.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Click any row to view full subscription and usage details.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Plans tab ── */}
        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
      </Tabs>

      {/* Tenant detail drawer */}
      <TenantDetailDrawer
        tenantId={selectedTenantId}
        onClose={() => setSelectedTenantId(null)}
        onStatusChange={handleStatusChange}
        statusChangePending={updateTenant.isPending}
      />
    </div>
  );
}
