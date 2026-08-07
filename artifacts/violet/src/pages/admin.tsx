import React, { useState } from "react";
import {
  useGetAdminStats,
  useListTenants,
  useUpdateAdminTenant,
  useListAdminPlans,
  useCreateAdminPlan,
  useUpdateAdminPlan,
} from "@workspace/api-client-react";
import type { Plan, PlanInput, PlanUpdate, TenantUpdateStatus } from "@workspace/api-client-react";
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
  Package,
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

// ── Plan Editor Sheet ─────────────────────────────────────────────────────────

interface PlanEditorProps {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;           // null = create mode
  allPlans: Plan[];
}

function PlanEditor({ open, onClose, plan, allPlans }: PlanEditorProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlanFormData>(plan ? planToForm(plan) : EMPTY_FORM);

  // Sync form when plan changes (e.g. switching which plan to edit)
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

  // Warn if setting this plan popular while another one already is
  const otherPopularPlans = allPlans.filter(
    (p) => p.isPopular && p.id !== plan?.id
  );
  const multiplePopularWarning = form.isPopular && otherPopularPlans.length > 0;

  const setField = <K extends keyof PlanFormData>(k: K, v: PlanFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleFeature = (value: string) => {
    setForm((f) => ({
      ...f,
      features: f.features.includes(value)
        ? f.features.filter((x) => x !== value)
        : [...f.features, value],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (plan) {
      // Edit mode: tier and billingType are NOT in PlanUpdate — omit them.
      // annualPrice must be explicitly null (not undefined/omitted) to clear an existing value.
      // We cast via unknown because PlanUpdate types annualPrice as number|undefined but the
      // server route already accepts null to clear the field.
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
      // Create mode: isActive is NOT in PlanInput — new plans are always active by default.
      // annualPrice: omit (undefined) when not provided.
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
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
      >
        <SheetHeader className="mb-6">
          <SheetTitle>{plan ? `Edit plan: ${plan.name}` : "New plan"}</SheetTitle>
          <SheetDescription>
            {plan
              ? "Changes are applied immediately. All tenants on this plan see the update on their next page load."
              : "Create a new subscription tier. You can edit all fields after creation."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Identity ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Plan identity</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">Name *</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="e.g. Professional"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Tier</Label>
                {plan ? (
                  /* Tier is fixed after creation — not in PlanUpdate */
                  <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm capitalize text-muted-foreground">
                    {plan.tier}
                    <span className="ml-auto text-xs opacity-60">locked</span>
                  </div>
                ) : (
                  <Select value={form.tier} onValueChange={(v) => setField("tier", v)}>
                    <SelectTrigger id="plan-tier">
                      <SelectValue />
                    </SelectTrigger>
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
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Short description shown on the pricing page"
                rows={2}
              />
            </div>
          </div>

          <Separator />

          {/* ── Pricing ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pricing</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Billing type</Label>
                {plan ? (
                  /* Billing type is fixed after creation — not in PlanUpdate */
                  <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm capitalize text-muted-foreground">
                    {plan.billingType?.replace("_", " ") ?? "—"}
                    <span className="ml-auto text-xs opacity-60">locked</span>
                  </div>
                ) : (
                  <Select value={form.billingType} onValueChange={(v) => setField("billingType", v)}>
                    <SelectTrigger id="plan-billing">
                      <SelectValue />
                    </SelectTrigger>
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
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setField("price", e.target.value)}
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
                type="number"
                min="0"
                step="0.01"
                value={form.annualPrice}
                onChange={(e) => setField("annualPrice", e.target.value)}
                placeholder="Leave blank if not offered"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-trial">Trial days</Label>
              <Input
                id="plan-trial"
                type="number"
                min="0"
                value={form.trialDays}
                onChange={(e) => setField("trialDays", e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* ── Limits ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  { key: "maxUsers",     label: "Max users" },
                  { key: "maxRegisters", label: "Max registers" },
                  { key: "maxBranches",  label: "Max branches" },
                  { key: "maxProducts",  label: "Max products" },
                  { key: "maxCustomers", label: "Max customers" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`plan-${key}`}>{label}</Label>
                  <Input
                    id={`plan-${key}`}
                    type="number"
                    min="0"
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* ── Features ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Features included</h3>
            <div className="space-y-3">
              {FEATURE_FLAGS.map((flag) => (
                <label
                  key={flag.value}
                  className="flex items-start gap-3 cursor-pointer group"
                >
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

          {/* ── Visibility ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Visibility</h3>

            {/* isActive is not in PlanInput — only show in edit mode */}
            {plan && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Active plan</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Inactive plans are hidden from the public pricing page
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setField("isActive", v)}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Most Popular badge
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Highlights this plan on the pricing page
                </p>
              </div>
              <Switch
                checked={form.isPopular}
                onCheckedChange={(v) => setField("isPopular", v)}
              />
            </div>

            {multiplePopularWarning && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-sm">
                  <strong>{otherPopularPlans.map((p) => p.name).join(", ")}</strong>{" "}
                  {otherPopularPlans.length === 1 ? "is" : "are"} also marked as Popular.
                  Consider removing the badge from the other plan so only one is highlighted.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <SheetFooter className="pt-2 gap-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
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

  const popularCount = plans.filter((p) => p.isPopular).length;

  const openCreate = () => {
    setEditingPlan(null);
    setEditorOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setEditorOpen(true);
  };

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
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          New plan
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
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Loading plans…
                </TableCell>
              </TableRow>
            ) : plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No plans found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => (
                <TableRow key={plan.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium flex items-center gap-1.5">
                          {plan.name}
                          {plan.isPopular && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          )}
                        </div>
                        <span
                          className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mt-0.5 ${tierColor[plan.tier] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {plan.tier}
                        </span>
                      </div>
                    </div>
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
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(plan.annualPrice)}/yr
                      </div>
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
                        (plan.features ?? []).slice(0, 3).map((f) => {
                          const flag = FEATURE_FLAGS.find((ff) => ff.value === f);
                          return (
                            <span
                              key={f}
                              className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium"
                            >
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
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(plan)}
                      className="gap-2"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
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
      },
      onError: (e: Error) => toast.error(e.message || "Failed to update tenant"),
    },
  });

  const toggleTenantStatus = (id: string, currentStatus: string) => {
    const newStatus: TenantUpdateStatus = currentStatus === "suspended" ? "active" : "suspended";
    if (confirm(`Are you sure you want to ${newStatus === "suspended" ? "suspend" : "activate"} this tenant?`)) {
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

      {/* Stats strip */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
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
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Building2 className="w-6 h-6 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Tenants</p>
              <div className="text-2xl font-bold">
                {statsLoading ? "…" : stats?.activeTenants || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
              <Package className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Plans</p>
              <div className="text-2xl font-bold">
                {statsLoading ? "…" : (stats?.revenueByPlan?.length ?? "—")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tenants">
        <TabsList className="mb-6">
          <TabsTrigger value="tenants" className="gap-2">
            <Users className="w-4 h-4" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2">
            <Package className="w-4 h-4" />
            Plans &amp; Features
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
                  onChange={(e) => setSearch(e.target.value)}
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
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          Loading tenants…
                        </TableCell>
                      </TableRow>
                    ) : tenants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No tenants found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <div className="font-medium">{tenant.name}</div>
                            <div className="text-xs text-muted-foreground">{tenant.email || "No email"}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{tenant.planName}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(tenant.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                tenant.status === "active"
                                  ? "success"
                                  : tenant.status === "suspended"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="uppercase text-[10px]"
                            >
                              {tenant.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleTenantStatus(tenant.id, tenant.status)}
                              className={
                                tenant.status === "suspended"
                                  ? "text-green-500 hover:text-green-600"
                                  : "text-destructive hover:text-destructive"
                              }
                              disabled={updateTenant.isPending}
                            >
                              {tenant.status === "suspended" ? "Activate" : "Suspend"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Plans tab ── */}
        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
