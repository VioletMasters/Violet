import React, { useMemo, useState } from "react";
import {
  useGetAdminStats,
  useListTenants,
  useGetAdminTenant,
  useUpdateAdminTenant,
  useCancelAdminTenantSubscription,
  useReactivateAdminTenantSubscription,
  useListAdminPlans,
  useCreateAdminPlan,
  useUpdateAdminPlan,
  useListAdminReleases,
  useCreateAdminRelease,
  useUpdateAdminRelease,
  useUploadAdminReleaseAsset,
  useUpdateAdminReleaseAsset,
  useGetAdminBilling,
  useListAdminSales,
  useListAdminAuditLogs,
  listAdminSales,
} from "@workspace/api-client-react";
import type {
  Plan, PlanInput, PlanUpdate, TenantUpdateStatus, PlatformRelease,
  PlatformReleaseInput, PlatformReleaseUpdate, ListAdminSalesParams,
  AdminSale,
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
  PauseCircle, GitBranch, Upload, Download, FileText, RefreshCw, ExternalLink,
  Filter, Database, CircleDot, Ban, History,
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
  currency: string;
  whopPlanId: string;
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
  currency: "USD",
  whopPlanId: "",
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
    currency: p.currency ?? "USD",
    whopPlanId: p.whopPlanId ?? "",
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
  const queryClient = useQueryClient();
  const { data: tenant, isLoading } = useGetAdminTenant(tenantId ?? "", {
    query: { ...getGetAdminTenantQueryOptions(tenantId ?? ""), enabled: !!tenantId },
  });
  const { data: plans } = useListAdminPlans();
  const [selectedPlanId, setSelectedPlanId] = useState("");

  React.useEffect(() => {
    setSelectedPlanId(tenant?.planId ?? "");
  }, [tenant?.planId]);

  const updatePlan = useUpdateAdminTenant({
    mutation: {
      onSuccess: async () => {
        toast.success("Account type updated");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetAdminTenantQueryOptions(tenantId ?? "").queryKey }),
          queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] }),
        ]);
      },
      onError: (error: Error) => {
        setSelectedPlanId(tenant?.planId ?? "");
        toast.error(error.message || "Could not change account type");
      },
    },
  });

  const cancelSubscription = useCancelAdminTenantSubscription({
    mutation: {
      onSuccess: async (result) => {
        toast.success(result.status === "cancelled" ? "Subscription cancelled" : "Cancellation scheduled");
        await queryClient.invalidateQueries({ queryKey: getGetAdminTenantQueryOptions(tenantId ?? "").queryKey });
      },
      onError: (error: Error) => toast.error(error.message || "Could not cancel subscription"),
    },
  });

  const reactivateSubscription = useReactivateAdminTenantSubscription({
    mutation: {
      onSuccess: async () => {
        toast.success("Subscription reactivated");
        await queryClient.invalidateQueries({ queryKey: getGetAdminTenantQueryOptions(tenantId ?? "").queryKey });
      },
      onError: (error: Error) => toast.error(error.message || "Could not reactivate subscription"),
    },
  });

  function changeAccountType(planId: string) {
    const nextPlan = plans?.find((plan) => plan.id === planId);
    if (!nextPlan || planId === tenant?.planId) return;
    if (!window.confirm(`Change this account to the ${nextPlan.name} account type?`)) {
      setSelectedPlanId(tenant?.planId ?? "");
      return;
    }
    updatePlan.mutate({ id: tenant!.id, data: { planId } });
  }

  function cancelTenantSubscription() {
    if (!tenant || !window.confirm(
      "Turn off automatic renewal for this tenant? The account stays active until the current period ends.",
    )) return;
    cancelSubscription.mutate({ id: tenant.id, data: { immediate: false } });
  }

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
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">License</span>
                  <span className={`font-medium capitalize ${tenant.licenseStatus === "valid" ? "text-emerald-600" : "text-destructive"}`}>
                    {tenant.licenseStatus ?? "unknown"}
                  </span>
                </div>
                {tenant.whopMembershipId && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Whop membership</span>
                    <span className="max-w-[190px] truncate font-mono text-xs" title={tenant.whopMembershipId}>
                      {tenant.whopMembershipId}
                    </span>
                  </div>
                )}
                {tenant.cancelAtPeriodEnd && (
                  <Alert className="mt-3 border-amber-500/30 bg-amber-500/10">
                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                      Cancellation is scheduled for the end of the current billing period.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            <Separator />

            {/* Account type */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Account type
              </h3>
              <div className="rounded-lg border p-4 space-y-3">
                <Select
                  value={selectedPlanId}
                  onValueChange={changeAccountType}
                  disabled={updatePlan.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose account type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(plans ?? []).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} · {plan.tier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Paid Whop memberships must be cancelled before an account type can be changed, preventing mismatched billing.
                </p>
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
              {tenant.cancelAtPeriodEnd ? (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  disabled={reactivateSubscription.isPending}
                  onClick={() => reactivateSubscription.mutate({ id: tenant.id })}
                >
                  <RefreshCw className="w-4 h-4" />
                  {reactivateSubscription.isPending ? "Reactivating subscription..." : "Reactivate subscription"}
                </Button>
              ) : tenant.subscriptionStatus === "active" && tenant.planTier !== "free" ? (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-amber-500/40 text-amber-700 hover:text-amber-800 dark:text-amber-300"
                  disabled={cancelSubscription.isPending}
                  onClick={cancelTenantSubscription}
                >
                  <Ban className="w-4 h-4" />
                  {cancelSubscription.isPending ? "Scheduling cancellation..." : "Cancel renewal"}
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground text-center">
                {tenant.status === "suspended"
                  ? "Activating restores the tenant's access to Violet."
                  : "Suspending blocks all logins for this tenant's users."}
              </p>
            </div>

            {(tenant.subscriptionHistory?.length ?? 0) > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Subscription history
                  </h3>
                  <div className="space-y-3">
                    {tenant.subscriptionHistory?.slice(0, 8).map((event) => (
                      <div key={event.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium capitalize">{event.eventType.replaceAll("_", " ")}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.fromPlanName && event.toPlanName
                            ? `${event.fromPlanName} → ${event.toPlanName}`
                            : event.toPlanName ?? event.fromPlanName ?? "No plan"}
                          {" · "}{event.source}
                        </p>
                        {event.reason && <p className="mt-1 text-xs text-muted-foreground">{event.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
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
        currency: form.currency,
        whopPlanId: form.whopPlanId.trim() || null,
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
        currency: form.currency,
        whopPlanId: form.whopPlanId.trim() || undefined,
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setField("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                    <SelectItem value="JMD">JMD — Jamaican Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-whop-id">Whop offer ID <span className="text-muted-foreground font-normal">optional</span></Label>
                <Input
                  id="plan-whop-id"
                  value={form.whopPlanId}
                  onChange={e => setField("whopPlanId", e.target.value)}
                  placeholder="plan_…"
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
                    <div className="font-medium">{formatCurrency(plan.price, plan.currency ?? "USD")}</div>
                    {plan.annualPrice != null && (
                      <div className="text-xs text-muted-foreground">{formatCurrency(plan.annualPrice, plan.currency ?? "USD")}/yr</div>
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

// ── Platform operations ───────────────────────────────────────────────────────

const releasePlatforms = [
  { value: "windows", label: "Windows", hint: ".exe or .msi" },
  { value: "macos", label: "macOS", hint: ".dmg or .pkg" },
  { value: "linux", label: "Linux", hint: ".AppImage or .deb" },
  { value: "docker", label: "Docker", hint: "image archive" },
] as const;

function formatBytes(bytes: number) {
  if (!bytes) return "No package";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function releaseBadge(status: string) {
  if (status === "published") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (status === "archived") return "bg-muted text-muted-foreground";
  return "bg-amber-500/10 text-amber-700 border-amber-500/20";
}

interface ReleaseEditorProps {
  open: boolean;
  release: PlatformRelease | null;
  onClose: () => void;
}

function ReleaseEditor({ open, release, onClose }: ReleaseEditorProps) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState("");
  const [channel, setChannel] = useState("stable");
  const [releaseNotes, setReleaseNotes] = useState("");

  React.useEffect(() => {
    setVersion(release?.version ?? "");
    setChannel(release?.channel ?? "stable");
    setReleaseNotes(release?.releaseNotes ?? "");
  }, [release?.id, open]);

  const createRelease = useCreateAdminRelease({
    mutation: {
      onSuccess: () => {
        toast.success("Release draft created");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"] });
        onClose();
      },
      onError: (error: Error) => toast.error(error.message || "Could not create release"),
    },
  });
  const updateRelease = useUpdateAdminRelease({
    mutation: {
      onSuccess: () => {
        toast.success("Release details updated");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"] });
        onClose();
      },
      onError: (error: Error) => toast.error(error.message || "Could not update release"),
    },
  });

  const pending = createRelease.isPending || updateRelease.isPending;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanVersion = version.trim();
    if (!cleanVersion) return;
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(cleanVersion)) {
      toast.error("Use a valid semantic version such as 2.8.0 or 2.8.0-beta.1");
      return;
    }
    if (release) {
      const payload: PlatformReleaseUpdate = {
        channel: channel as PlatformReleaseUpdate["channel"],
        releaseNotes: releaseNotes.trim(),
      };
      updateRelease.mutate({ id: release.id, data: payload });
    } else {
      const payload: PlatformReleaseInput = {
        version: cleanVersion,
        channel: channel as PlatformReleaseInput["channel"],
        releaseNotes: releaseNotes.trim(),
      };
      createRelease.mutate({ data: payload });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-7">
          <SheetTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            {release ? `Edit ${release.version}` : "Create release draft"}
          </SheetTitle>
          <SheetDescription>
            {release
              ? "Keep the release metadata aligned before publishing it to customers."
              : "Create the semantic version first, then attach a package or external download link for each platform."}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="release-version">Semantic version</Label>
            <Input
              id="release-version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="e.g. 2.8.0"
              disabled={!!release}
              pattern="^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$"
              required
            />
            <p className="text-xs text-muted-foreground">Use a version such as 2.8.0, without a leading v.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="release-channel">Distribution channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="release-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="nightly">Nightly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="release-notes">Release notes</Label>
            <Textarea
              id="release-notes"
              value={releaseNotes}
              onChange={(event) => setReleaseNotes(event.target.value)}
              placeholder="Summarize what changed and any operator actions."
              rows={8}
            />
          </div>
          <SheetFooter className="gap-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={pending}>Cancel</Button>
            </SheetClose>
            <Button type="submit" disabled={pending || !version.trim()}>
              {pending ? "Saving..." : release ? "Save release" : "Create draft"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface ExternalReleaseLinkEditorProps {
  release: PlatformRelease;
  platform: typeof releasePlatforms[number]["value"];
  asset: PlatformRelease["assets"][number] | undefined;
}

function ExternalReleaseLinkEditor({ release, platform, asset }: ExternalReleaseLinkEditorProps) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(asset?.downloadUrl ?? "");
  const updateAsset = useUpdateAdminReleaseAsset({
    mutation: {
      onSuccess: () => {
        toast.success(`${releasePlatforms.find((item) => item.value === platform)?.label ?? "Platform"} download link saved`);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"] });
      },
      onError: (error: Error) => toast.error(error.message || "Could not save download link"),
    },
  });

  React.useEffect(() => {
    setUrl(asset?.downloadUrl ?? "");
  }, [asset?.id, asset?.downloadUrl]);

  const currentUrl = asset?.downloadUrl ?? "";
  const cleanUrl = url.trim();
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (cleanUrl) {
      try {
        if (new URL(cleanUrl).protocol !== "https:") throw new Error();
      } catch {
        toast.error("Use a valid HTTPS URL, such as a GitHub release or Actions artifact link");
        return;
      }
    }
    updateAsset.mutate({ id: release.id, platform, data: { downloadUrl: cleanUrl || null } });
  };

  return (
    <form onSubmit={save} className="mt-3 space-y-2 border-t pt-3">
      <Label htmlFor={`release-${release.id}-${platform}-url`} className="text-xs text-muted-foreground">
        External download URL
      </Label>
      <div className="flex gap-2">
        <Input
          id={`release-${release.id}-${platform}-url`}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://github.com/.../artifacts/..."
          className="min-w-0 text-xs"
          maxLength={2048}
          disabled={updateAsset.isPending}
        />
        <Button type="submit" size="sm" variant="outline" disabled={updateAsset.isPending || cleanUrl === currentUrl}>
          {updateAsset.isPending ? "Saving..." : "Save link"}
        </Button>
      </div>
      {asset?.downloadUrl ? (
        <a
          href={asset.downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
        >
          <span className="truncate">{asset.downloadUrl}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Add a secure HTTPS link when the installer is hosted on GitHub or another trusted service.
        </p>
      )}
    </form>
  );
}

function ReleasesTab() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRelease, setEditingRelease] = useState<PlatformRelease | null>(null);
  const { data: releases = [], isLoading, isError, error, refetch } = useListAdminReleases();
  const updateRelease = useUpdateAdminRelease({
    mutation: {
      onSuccess: () => {
        toast.success("Release status updated");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"] });
      },
      onError: (mutationError: Error) => toast.error(mutationError.message || "Could not update release status"),
    },
  });
  const uploadAsset = useUploadAdminReleaseAsset({
    mutation: {
      onSuccess: () => {
        toast.success("Package uploaded");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"] });
      },
      onError: (mutationError: Error) => toast.error(mutationError.message || "Could not upload package"),
    },
  });

  const openNewRelease = () => {
    setEditingRelease(null);
    setEditorOpen(true);
  };
  const openEditor = (release: PlatformRelease) => {
    setEditingRelease(release);
    setEditorOpen(true);
  };
  const setStatus = (release: PlatformRelease) => {
    const nextStatus = release.status === "published" ? "draft" : "published";
    const label = nextStatus === "published" ? "publish" : "unpublish";
    if (!window.confirm(`Are you sure you want to ${label} ${release.version}?`)) return;
    updateRelease.mutate({
      id: release.id,
      data: { status: nextStatus as PlatformReleaseUpdate["status"] },
    });
  };
  const upload = (release: PlatformRelease, platform: typeof releasePlatforms[number]["value"], file: File | undefined) => {
    if (!file) return;
    uploadAsset.mutate({ id: release.id, platform, data: file });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Release pipeline</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft, package, and publish desktop updates from one controlled surface. You can upload packages or point each platform to an external download link.
          </p>
        </div>
        <Button onClick={openNewRelease} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> New release
        </Button>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{(error as Error)?.message || "Releases could not be loaded."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 shrink-0">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((item) => <div key={item} className="h-48 rounded-xl border bg-muted/30 animate-pulse" />)}
        </div>
      ) : releases.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-3 text-primary"><GitBranch className="h-6 w-6" /></div>
            <p className="font-medium">No platform releases yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create a draft to start the next release train.</p>
            <Button onClick={openNewRelease} variant="outline" size="sm" className="mt-4">Create first draft</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {releases.map((release) => (
            <Card key={release.id} className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border bg-background p-2 text-primary"><GitBranch className="h-5 w-5" /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">{release.version}</CardTitle>
                        <Badge variant="outline" className={releaseBadge(release.status)}>{release.status}</Badge>
                        <Badge variant="secondary" className="capitalize">{release.channel}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Created {release.createdAt ? formatDate(release.createdAt) : "recently"}
                        {release.publishedAt ? ` · Published ${formatDate(release.publishedAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditor(release)} className="gap-2">
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={release.status === "published" ? "outline" : "default"}
                      onClick={() => setStatus(release)}
                      disabled={updateRelease.isPending}
                    >
                      {release.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                  <div className="rounded-lg border bg-background/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-primary" /> Platform packages</div>
                    <span className="text-xs text-muted-foreground">{release.assets.length}/4 attached</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {releasePlatforms.map((platform) => {
                      const asset = release.assets.find((item) => item.platform === platform.value);
                      return (
                          <div key={platform.value} className="rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-primary/[0.03]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{platform.label}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {asset?.downloadUrl
                                    ? "External download link is active"
                                    : asset
                                      ? `${asset.fileName} · ${formatBytes(asset.sizeBytes)}`
                                      : platform.hint}
                                </p>
                              </div>
                              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                                <Upload className="h-3.5 w-3.5" />
                                Upload
                                <Input
                                  type="file"
                                  className="sr-only"
                                  onChange={(event) => {
                                    upload(release, platform.value, event.target.files?.[0]);
                                    event.currentTarget.value = "";
                                  }}
                                  disabled={uploadAsset.isPending}
                                />
                              </label>
                            </div>
                            <ExternalReleaseLinkEditor release={release} platform={platform.value} asset={asset} />
                          </div>
                      );
                    })}
                  </div>
                </div>
                {release.releaseNotes ? (
                  <div className="flex gap-3 text-sm">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="whitespace-pre-line text-muted-foreground">{release.releaseNotes}</p>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No release notes added.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ReleaseEditor open={editorOpen} release={editingRelease} onClose={() => setEditorOpen(false)} />
    </div>
  );
}

function BillingTab() {
  const { data, isLoading, isError, error, refetch } = useGetAdminBilling();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold">Plans &amp; billing</p>
          <p className="mt-1 text-sm text-muted-foreground">Compare the local catalog with the values currently returned by Whop.</p>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Provider</span>
            <Badge variant={data.companyConfigured ? "success" : "destructive"}>{data.companyConfigured ? "Configured" : "Needs configuration"}</Badge>
            <span className="text-muted-foreground">{data.providerStatus}</span>
          </div>
        )}
      </div>
      <Alert className="border-primary/20 bg-primary/[0.04]">
        <Database className="h-4 w-4 text-primary" />
        <AlertDescription>
          <strong>Source of truth:</strong> local Violet plan values control tenant access and the in-app catalog.
          Whop values are shown for reconciliation only; changes made here do not edit provider offers.
        </AlertDescription>
      </Alert>
      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{(error as Error)?.message || "Billing data could not be loaded."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="h-80 rounded-xl border bg-muted/30 animate-pulse" />
      ) : !data || data.plans.length === 0 ? (
        <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <CreditCard className="mb-3 h-7 w-7 text-muted-foreground" />
          <p className="font-medium">No billing plans to reconcile</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a local plan first, then return here to inspect its provider values.</p>
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Local plan</TableHead>
                <TableHead>Local price</TableHead>
                <TableHead>Whop offer</TableHead>
                <TableHead>Whop pricing</TableHead>
                <TableHead>Alignment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.plans.map(({ local, whop }) => {
                const hasOffer = !!whop && !whop.error;
                const priceMatches = hasOffer && whop?.renewalPrice != null && Number(whop.renewalPrice) === Number(local.price);
                return (
                  <TableRow key={local.id}>
                    <TableCell><div className="font-medium">{local.name}</div><div className="text-xs capitalize text-muted-foreground">{local.tier}</div></TableCell>
                    <TableCell><div className="font-medium">{formatCurrency(local.price, local.currency ?? "USD")}</div><div className="text-xs text-muted-foreground capitalize">{local.currency ?? "USD"} · {local.billingType?.replace("_", " ")}</div></TableCell>
                    <TableCell>{hasOffer ? <><div className="font-medium">{whop?.title || whop?.id || "Connected offer"}</div><div className="text-xs text-muted-foreground">{whop?.currency || "—"} · {whop?.visibility || "—"}</div></> : <span className="text-sm text-muted-foreground">{whop?.error || "Not connected"}</span>}</TableCell>
                    <TableCell>{hasOffer ? <><div className="font-medium">{whop?.renewalPrice != null ? formatCurrency(whop.renewalPrice, whop.currency || "USD") : "—"}</div><div className="text-xs text-muted-foreground">{whop.currency || "USD"} · Initial {whop?.initialPrice != null ? formatCurrency(whop.initialPrice, whop.currency || "USD") : "—"}</div></> : "—"}</TableCell>
                    <TableCell>{priceMatches ? <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Matches</Badge> : <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">{hasOffer ? "Review values" : "Needs mapping"}</Badge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function SalesTab() {
  const [search, setSearch] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const limit = 25;
  const params = useMemo<ListAdminSalesParams>(() => ({
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
    page,
    limit,
  }), [startDate, endDate, tenantId, paymentMethod, status, search, page]);
  const { data, isLoading, isError, error, refetch } = useListAdminSales(params);
  const salesPage = typeof data === "string" ? undefined : data;

  const clearFilters = () => {
    setSearch(""); setTenantId(""); setPaymentMethod(""); setStatus(""); setStartDate(""); setEndDate(""); setPage(1);
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await listAdminSales({ ...params, page: undefined, limit: undefined, format: "csv" });
      const csv = typeof response === "string"
        ? response
        : [
            ["Receipt", "Tenant", "Amount", "Payment method", "Status", "Date"].map(csvEscape).join(","),
            ...response.data.map((sale) => [sale.receiptNumber, sale.tenantName, sale.totalAmount, sale.paymentMethod, sale.status, sale.createdAt].map(csvEscape).join(",")),
          ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `violet-sales-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click(); URL.revokeObjectURL(url);
      toast.success("Sales export downloaded");
    } catch (exportError) {
      toast.error((exportError as Error).message || "Could not export sales");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold">Global sales ledger</p><p className="mt-1 text-sm text-muted-foreground">Search transactions across every tenant and reconcile gross revenue.</p></div>
        <Button variant="outline" onClick={exportCsv} disabled={exporting} className="gap-2"><Download className="h-4 w-4" /> {exporting ? "Preparing..." : "Export CSV"}</Button>
      </div>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Receipt or tenant" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
          <Input placeholder="Tenant ID" value={tenantId} onChange={(event) => { setTenantId(event.target.value); setPage(1); }} />
          <Select value={paymentMethod || "all"} onValueChange={(value) => { setPaymentMethod(value === "all" ? "" : value); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Payment method" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All payment methods</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="mobile">Mobile</SelectItem></SelectContent>
          </Select>
          <Select value={status || "all"} onValueChange={(value) => { setStatus(value === "all" ? "" : value); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="refunded">Refunded</SelectItem><SelectItem value="voided">Voided</SelectItem></SelectContent>
          </Select>
          <Button variant="ghost" onClick={clearFilters} className="gap-2"><Filter className="h-4 w-4" /> Clear</Button>
          <div className="flex items-center gap-2 lg:col-span-2"><Label htmlFor="sales-start" className="text-xs text-muted-foreground">From</Label><Input id="sales-start" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></div>
          <div className="flex items-center gap-2 lg:col-span-2"><Label htmlFor="sales-end" className="text-xs text-muted-foreground">To</Label><Input id="sales-end" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></div>
        </CardContent>
      </Card>
      {salesPage && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filtered revenue</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatCurrency(salesPage.summary.revenue, "JMD")}</p><p className="mt-1 text-xs text-muted-foreground">Mixed tenant currencies are reported in each transaction row.</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transactions</p><p className="mt-2 text-2xl font-semibold tabular-nums">{salesPage.summary.orders.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Page {salesPage.page} of {Math.max(1, Math.ceil(salesPage.total / salesPage.limit))}</p></CardContent></Card>
        </div>
      )}
      {isError ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription className="flex items-center justify-between gap-4"><span>{(error as Error)?.message || "Sales could not be loaded."}</span><Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></AlertDescription></Alert>
      ) : isLoading ? (
        <div className="h-72 rounded-xl border bg-muted/30 animate-pulse" />
      ) : !salesPage || salesPage.data.length === 0 ? (
        <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><CircleDot className="mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">No transactions match these filters</p><p className="mt-1 text-sm text-muted-foreground">Try clearing a filter or expanding the date range.</p></CardContent></Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50"><TableRow><TableHead>Receipt</TableHead><TableHead>Tenant</TableHead><TableHead>Amount</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>{salesPage.data.map((sale: AdminSale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-mono text-xs">{sale.receiptNumber}</TableCell>
                <TableCell><div className="font-medium">{sale.tenantName || "Unknown tenant"}</div><div className="text-xs text-muted-foreground">{sale.tenantId}</div></TableCell>
                <TableCell className="font-medium tabular-nums">{formatCurrency(sale.totalAmount, sale.currency || "JMD")} <span className="text-xs font-normal text-muted-foreground">{sale.currency || "JMD"}</span></TableCell>
                <TableCell className="capitalize text-muted-foreground">{sale.paymentMethod}</TableCell>
                <TableCell><Badge variant={sale.status === "completed" ? "success" : "outline"} className="capitalize">{sale.status}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(sale.createdAt)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">{salesPage.total.toLocaleString()} total transactions</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= Math.ceil(salesPage.total / limit)} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
        </Card>
      )}
    </div>
  );
}

function AuditTab() {
  const { data: logs = [], isLoading, isError, error, refetch } = useListAdminAuditLogs();
  return (
    <div className="space-y-6">
      <div><p className="text-sm font-semibold">Admin audit trail</p><p className="mt-1 text-sm text-muted-foreground">A read-only record of recent platform-level changes and operational actions.</p></div>
      {isError ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription className="flex items-center justify-between gap-4"><span>{(error as Error)?.message || "Audit events could not be loaded."}</span><Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></AlertDescription></Alert>
      ) : isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 rounded-lg border bg-muted/30 animate-pulse" />)}</div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><FileText className="mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">No admin activity recorded</p><p className="mt-1 text-sm text-muted-foreground">Release, billing, and tenant actions will appear here.</p></CardContent></Card>
      ) : (
        <Card className="overflow-hidden">
          <Table><TableHeader className="bg-muted/50"><TableRow><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
            <TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell><div className="font-medium">{log.summary}</div><div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{log.action}</div></TableCell><TableCell><span className="capitalize">{log.entityType}</span>{log.entityId && <div className="font-mono text-xs text-muted-foreground">{log.entityId}</div>}</TableCell><TableCell>{log.actorName}</TableCell><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(log.createdAt)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Card>
      )}
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
          <TabsTrigger value="releases" className="gap-2">
            <GitBranch className="w-4 h-4" /> Releases
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <CreditCard className="w-4 h-4" /> Billing
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-2">
            <TrendingUp className="w-4 h-4" /> Sales
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <FileText className="w-4 h-4" /> Audit
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

        <TabsContent value="releases">
          <ReleasesTab />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>

        <TabsContent value="sales">
          <SalesTab />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab />
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
