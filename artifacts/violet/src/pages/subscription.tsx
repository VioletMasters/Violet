import React from "react";
import { useGetSubscription, useListPlans } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CheckCircle2, Zap } from "lucide-react";

export default function SubscriptionPage() {
  const { data: sub, isLoading: subLoading } = useGetSubscription();
  const { data: plans, isLoading: plansLoading } = useListPlans();

  if (subLoading || plansLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading subscription...</div>;
  }

  const currentPlan = sub?.plan;
  const isFree = currentPlan?.tier === "free";

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Subscription</h1>
        <p className="text-muted-foreground mt-1">Manage your plan and usage</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <Card className="md:col-span-2 border-primary/20 relative overflow-hidden bg-card">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              {currentPlan?.name} Plan
              <Badge variant={sub?.status === 'active' ? 'success' : 'secondary'} className="ml-2 uppercase text-[10px]">
                {sub?.status}
              </Badge>
            </CardTitle>
            <CardDescription className="text-base">
              {isFree ? "You are on the free lifetime plan." : `Your next billing date is ${sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'N/A'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 mt-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">Products Limit</span>
                  <span className="text-muted-foreground">
                    {sub?.usage?.products || 0} / {currentPlan?.maxProducts === -1 ? 'Unlimited' : currentPlan?.maxProducts}
                  </span>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all" 
                    style={{ width: currentPlan?.maxProducts && currentPlan.maxProducts > 0 ? `${Math.min(100, ((sub?.usage?.products || 0) / currentPlan.maxProducts) * 100)}%` : '5%' }} 
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">Users Limit</span>
                  <span className="text-muted-foreground">
                    {sub?.usage?.users || 0} / {currentPlan?.maxUsers === -1 ? 'Unlimited' : currentPlan?.maxUsers}
                  </span>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all" 
                    style={{ width: currentPlan?.maxUsers && currentPlan.maxUsers > 0 ? `${Math.min(100, ((sub?.usage?.users || 0) / currentPlan.maxUsers) * 100)}%` : '5%' }} 
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-secondary/30 pt-4 flex justify-end gap-4 border-t border-border/50">
            {!isFree && <Button variant="outline">Manage Billing</Button>}
          </CardFooter>
        </Card>

        {isFree && (
          <Card className="bg-primary text-primary-foreground border-none shadow-xl flex flex-col justify-center text-center p-6">
            <Zap className="w-12 h-12 mx-auto mb-4 opacity-80" />
            <h3 className="text-xl font-bold mb-2">Ready for more power?</h3>
            <p className="text-primary-foreground/80 text-sm mb-6">
              Upgrade to Starter to unlock employee management, advanced inventory, and detailed reports.
            </p>
            <Button variant="secondary" className="w-full font-bold">Upgrade Plan</Button>
          </Card>
        )}
      </div>

      <div className="pt-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">Available Plans</h2>
          <p className="text-muted-foreground">Scale Violet Enterprise as your business grows.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans?.map((plan) => (
            <Card key={plan.id} className={`flex flex-col ${plan.id === currentPlan?.id ? 'border-primary ring-1 ring-primary' : ''}`}>
              <CardHeader>
                {plan.id === currentPlan?.id && (
                  <Badge className="w-fit mb-4 bg-primary text-primary-foreground">Current Plan</Badge>
                )}
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="text-3xl font-bold mt-2">
                  {formatCurrency(plan.price)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {plan.billingType === 'monthly' ? ' /mo' : ' one-time'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {plan.maxRegisters === -1 ? 'Unlimited' : plan.maxRegisters} Registers</li>
                  <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers} Users</li>
                  <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {plan.maxProducts === -1 ? 'Unlimited' : plan.maxProducts} Products</li>
                  {plan.features?.map((f, i) => (
                    <li key={i} className="flex gap-2 items-start"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> <span>{f}</span></li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {plan.id === currentPlan?.id ? (
                  <Button variant="secondary" className="w-full" disabled>Current Plan</Button>
                ) : (
                  <Button variant={plan.tier === 'professional' ? 'default' : 'outline'} className="w-full">
                    {plan.price > (currentPlan?.price || 0) ? 'Upgrade' : 'Downgrade'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}