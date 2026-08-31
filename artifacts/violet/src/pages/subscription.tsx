import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSubscriptionQueryKey,
  reconcileBillingCheckout,
  useCancelBillingCheckout,
  useCreateBillingCheckout,
  useGetSubscription,
  useListPlans,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { paidTiers, planLabel, type PaidTier } from "@/lib/billing";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck, Zap } from "lucide-react";

type CheckoutNotice = {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
} | null;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export default function SubscriptionPage() {
  const queryClient = useQueryClient();
  const { user, tenant, token, updateTenant } = useAuth();
  const { data: sub, isLoading, isError } = useGetSubscription();
  const { data: plans } = useListPlans();
  const [notice, setNotice] = React.useState<CheckoutNotice>(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    return checkout === "error"
      ? {
          tone: "error",
          title: "Checkout could not be opened",
          message: "Your account is ready. Choose a plan below to try secure checkout again.",
        }
      : null;
  });
  const [isReconciling, setIsReconciling] = React.useState(false);
  const [checkoutTier, setCheckoutTier] = React.useState<PaidTier | null>(null);
  const autoReconcileStarted = React.useRef(false);

  const markBillingRestored = React.useCallback(() => {
    if (tenant?.requiresBillingAction) {
      updateTenant({ ...tenant, requiresBillingAction: false, billingMessage: null });
    }
  }, [tenant, updateTenant]);

  const verifyCheckout = React.useCallback(async (poll: boolean) => {
    if (!user || !token) return;
    setIsReconciling(true);
    setNotice({
      tone: "info",
      title: "Verifying with Whop",
      message: "Violet is checking the server-owned checkout and payment status.",
    });

    try {
      const attempts = poll ? 6 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const result = await reconcileBillingCheckout({});
        if (result.status !== "pending") {
          setNotice({
            tone: result.success ? "success" : "error",
            title: result.success ? `${planLabel(result.tier)} activated` : "Plan not activated",
            message: result.message,
          });
          if (result.success) markBillingRestored();
          await queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() });
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        if (attempt < attempts - 1) await delay(2000);
      }

      setNotice({
        tone: "warning",
        title: "Payment is still pending",
        message: "Whop has not confirmed the payment yet. You can safely check again in a moment.",
      });
      await queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() });
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Verification unavailable",
        message: error instanceof Error ? error.message : "Violet could not verify this checkout.",
      });
    } finally {
      setIsReconciling(false);
    }
  }, [markBillingRestored, queryClient, token, user]);

  React.useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (checkout === "complete" && !autoReconcileStarted.current) {
      autoReconcileStarted.current = true;
      void verifyCheckout(true);
    }
  }, [verifyCheckout]);

  React.useEffect(() => {
    if (
      sub &&
      ["active", "trial"].includes(sub.status) &&
      !["failed", "past_due", "refunded"].includes(sub.paymentStatus ?? "")
    ) {
      markBillingRestored();
    }
  }, [markBillingRestored, sub]);

  const checkoutMutation = useCreateBillingCheckout({
    mutation: {
      onSuccess: (checkout) => window.location.assign(checkout.checkoutUrl),
      onError: (error) => {
        setCheckoutTier(null);
        setNotice({
          tone: "error",
          title: "Checkout unavailable",
          message: error.message || "Violet could not open Whop checkout.",
        });
      },
    },
  });

  const cancelCheckoutMutation = useCancelBillingCheckout({
    mutation: {
      onSuccess: async () => {
        setCheckoutTier(null);
        setNotice({
          tone: "success",
          title: "Pending checkout cancelled",
          message: "You can now choose a different Violet plan.",
        });
        await queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() });
      },
      onError: (error) => {
        setNotice({
          tone: "error",
          title: "Checkout could not be cancelled",
          message: error.message || "Violet could not cancel the pending Whop checkout.",
        });
      },
    },
  });

  function startCheckout(tier: PaidTier) {
    setCheckoutTier(tier);
    setNotice(null);
    checkoutMutation.mutate({ data: { tier } });
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading subscription...</div>;
  }

  if (isError || !sub?.plan) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Subscription unavailable</CardTitle>
          <CardDescription>
            Violet could not load the current license for this business.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const currentPlan = sub.plan;
  const isFree = currentPlan.tier === "free";
  const productsUsed = sub.usage?.products ?? 0;
  const usersUsed = sub.usage?.users ?? 0;
  const billingNeedsAttention =
    ["expired", "cancelled"].includes(sub.status) ||
    ["failed", "past_due", "refunded"].includes(sub.paymentStatus ?? "");
  const availablePlans = (plans ?? []).filter((plan) => paidTiers.includes(plan.tier as PaidTier));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Subscription</h1>
        <p className="mt-1 text-muted-foreground">
          Your current Violet plan and license status.
        </p>
      </div>

      {notice && <CheckoutStatusNotice notice={notice} />}
      {!notice && tenant?.requiresBillingAction && (
        <CheckoutStatusNotice
          notice={{
            tone: "warning",
            title: "Billing action required",
            message: tenant.billingMessage || "Restore your Whop subscription to continue using Violet.",
          }}
        />
      )}

      <Card className="relative overflow-hidden border-primary/20 bg-card">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/3 rounded-full bg-primary/5 blur-3xl" />
        <CardHeader className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
                {currentPlan.name} Plan
                <Badge
                  variant={!billingNeedsAttention ? "success" : "destructive"}
                  className="uppercase text-[10px]"
                >
                  {sub.paymentStatus === "past_due" ? "PAST DUE" : sub.status}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-2 max-w-xl text-base">
                {billingNeedsAttention
                  ? "Your operational workspace is protected until billing is restored."
                  : isFree
                  ? "Your free Violet license is active."
                  : sub.currentPeriodEnd
                    ? `Your next billing date is ${formatDate(sub.currentPeriodEnd)}.`
                    : "Your Violet license is active."}
              </CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-3xl font-bold tabular-nums">
                {formatCurrency(currentPlan.price, currentPlan.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                {currentPlan.billingType === "monthly" ? "per month" : "one-time"}
              </p>
              {!isFree && (
                <p className="mt-1 text-xs font-medium text-primary">
                  Whop charges {formatCurrency(currentPlan.checkoutPrice, currentPlan.checkoutCurrency)} / month
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <UsageMeter
              label="Products"
              used={productsUsed}
              limit={currentPlan.maxProducts}
            />
            <UsageMeter
              label="Users"
              used={usersUsed}
              limit={currentPlan.maxUsers}
            />
          </div>

          <div className="grid gap-3 border-t pt-5 sm:grid-cols-2">
            {(currentPlan.features ?? []).map((feature) => (
              <div key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>

        <div className="flex flex-col gap-3 border-t bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Whop securely manages paid plan billing in USD.
          </div>
          {sub.checkoutPending ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                onClick={() => void verifyCheckout(true)}
                disabled={isReconciling || cancelCheckoutMutation.isPending}
                className="w-full gap-2 sm:w-auto"
              >
                {isReconciling ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Check payment
              </Button>
              <Button
                onClick={() => cancelCheckoutMutation.mutate()}
                disabled={isReconciling || cancelCheckoutMutation.isPending}
                variant="outline"
                className="w-full sm:w-auto"
              >
                {cancelCheckoutMutation.isPending ? "Cancelling..." : "Cancel checkout"}
              </Button>
            </div>
          ) : !tenant?.requiresBillingAction ? (
            <Button onClick={() => window.location.assign("/pos")} variant="outline" className="w-full sm:w-auto">
              Go to Point of Sale
            </Button>
          ) : null}
        </div>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Choose a paid plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Violet creates checkout only after you sign in, then activates access after server-side Whop verification.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {availablePlans.map((plan) => {
            const tier = plan.tier as PaidTier;
            const isCurrent = currentPlan.tier === tier && !billingNeedsAttention;
            const isOpening = checkoutMutation.isPending && checkoutTier === tier;
            return (
              <Card key={plan.id} className={plan.isPopular ? "border-primary/50" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.isPopular && <Badge>Popular</Badge>}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-2xl font-bold">{formatCurrency(plan.price, plan.currency)}</span>
                    <span className="text-sm text-muted-foreground"> / month</span>
                    <p className="mt-1 text-xs font-medium text-primary">
                      Whop charges {formatCurrency(plan.checkoutPrice, plan.checkoutCurrency)} / month
                    </p>
                  </div>
                  <Button
                    className="w-full gap-2"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={
                      isCurrent ||
                      checkoutMutation.isPending ||
                      isReconciling ||
                      cancelCheckoutMutation.isPending ||
                      sub.checkoutPending
                    }
                    onClick={() => startCheckout(tier)}
                  >
                    {isOpening ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Opening Whop...
                      </>
                    ) : isCurrent ? (
                      "Current plan"
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        {billingNeedsAttention && currentPlan.tier === tier ? "Restore plan" : `Choose ${planLabel(tier)}`}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CheckoutStatusNotice({ notice }: { notice: NonNullable<CheckoutNotice> }) {
  const styles = {
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
    info: "border-primary/30 bg-primary/10 text-primary",
  };
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "info" ? LoaderCircle : AlertCircle;
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${styles[notice.tone]}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${notice.tone === "info" ? "animate-spin" : ""}`} />
      <div>
        <p className="font-semibold">{notice.title}</p>
        <p className="mt-1 text-sm opacity-90">{notice.message}</p>
      </div>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit?: number }) {
  const unlimited = limit === -1;
  const percent = unlimited || !limit ? 5 : Math.min(100, (used / limit) * 100);

  return (
    <div className="rounded-lg border bg-secondary/20 p-4">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used.toLocaleString()} / {unlimited ? "Unlimited" : limit?.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}