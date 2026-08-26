import React from "react";
import { useGetSubscription } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CheckCircle2, ExternalLink, Zap } from "lucide-react";

const publicWebsiteUrl =
  import.meta.env.VITE_PUBLIC_WEBSITE_URL || "https://violetenterprise.com";

function openUpgradePage() {
  window.open(`${publicWebsiteUrl.replace(/\/$/, "")}/pricing`, "_blank", "noopener,noreferrer");
}

export default function SubscriptionPage() {
  const { data: sub, isLoading, isError } = useGetSubscription();

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
  const enterprisePrice =
    currentPlan.tier === "enterprise" && currentPlan.price === 0
      ? 150000
      : currentPlan.price;
  const productsUsed = sub.usage?.products ?? 0;
  const usersUsed = sub.usage?.users ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Subscription</h1>
        <p className="mt-1 text-muted-foreground">
          Your current Violet plan and license status.
        </p>
      </div>

      <Card className="relative overflow-hidden border-primary/20 bg-card">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/3 rounded-full bg-primary/5 blur-3xl" />
        <CardHeader className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
                {currentPlan.name} Plan
                <Badge
                  variant={sub.status === "active" || sub.status === "trial" ? "success" : "destructive"}
                  className="uppercase text-[10px]"
                >
                  {sub.status}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-2 max-w-xl text-base">
                {isFree
                  ? "Your free Violet license is active."
                  : sub.currentPeriodEnd
                    ? `Your next billing date is ${formatDate(sub.currentPeriodEnd)}.`
                    : "Your Violet license is active."}
              </CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-3xl font-bold tabular-nums">
                {formatCurrency(enterprisePrice, "JMD")}
              </p>
              <p className="text-sm text-muted-foreground">
                {currentPlan.billingType === "monthly" ? "per month" : "one-time"}
              </p>
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
            <Zap className="h-4 w-4 text-primary" />
            Need more capacity or features?
          </div>
          <Button onClick={openUpgradePage} className="w-full gap-2 sm:w-auto">
            Upgrade
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </Card>
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