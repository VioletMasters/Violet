import React, { useEffect, useMemo, useState } from "react";
import { useReportsContext } from "./context";
import {
  getListRegisterShiftsQueryKey,
  useCreateShiftCashEvent,
  useGetCashReport,
  useListRegisterShifts,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Banknote, ClipboardCheck, LogOut, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export function cashEventDisplayAmount(event: any): string {
  const amount = Math.abs(Number(event.amount ?? 0));
  if (event.type === "sale") return `+${formatCurrency(amount)}`;
  if (["drop", "payout", "refund"].includes(event.type)) return `-${formatCurrency(amount)}`;
  return `${Number(event.amount ?? 0) >= 0 ? "+" : "-"}${formatCurrency(amount)}`;
}

type CashEventRecorderProps = {
  storeId?: string;
  registerId?: string;
  cashierId?: string;
};

type OpenShift = {
  id: string;
  storeId: string;
  storeName?: string | null;
  registerId: string;
  registerName?: string | null;
  cashierName?: string | null;
};

export function CashEventRecorder({
  storeId,
  registerId,
  cashierId,
}: CashEventRecorderProps) {
  const { isManagerAccessActive } = useAuth();
  const queryClient = useQueryClient();
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [eventType, setEventType] = useState<"drop" | "payout">("drop");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const openShiftParams = useMemo(() => ({
    status: "open" as const,
    ...(storeId ? { storeId } : {}),
    ...(registerId ? { registerId } : {}),
    ...(cashierId ? { cashierId } : {}),
  }), [cashierId, registerId, storeId]);
  const { data: shiftsResponse, isLoading: isLoadingShifts } = useListRegisterShifts(openShiftParams, {
    query: { queryKey: getListRegisterShiftsQueryKey(openShiftParams), enabled: isManagerAccessActive },
  });
  const openShifts = ((shiftsResponse as { data?: OpenShift[] } | undefined)?.data ?? []);
  const createCashEvent = useCreateShiftCashEvent();

  useEffect(() => {
    if (!openShifts.some((shift) => shift.id === selectedShiftId)) {
      setSelectedShiftId(openShifts[0]?.id ?? "");
    }
  }, [openShifts, selectedShiftId]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!selectedShiftId) {
      toast.error("Choose an open register shift.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a reason for the cash movement.");
      return;
    }

    createCashEvent.mutate(
      { id: selectedShiftId, data: { type: eventType, amount: parsedAmount, reason: reason.trim() } },
      {
        onSuccess: () => {
          // The full reports view may include additional display-only filters
          // in its query key, so invalidate every cash-report variant.
          queryClient.invalidateQueries({ queryKey: ["/api/reports/cash"] });
          queryClient.invalidateQueries({ queryKey: getListRegisterShiftsQueryKey(openShiftParams) });
          setAmount("");
          setReason("");
          toast.success(eventType === "drop" ? "Cash drop recorded." : "Cash payout recorded.");
        },
        onError: (error) => toast.error(error.message || "Could not record the cash movement."),
      },
    );
  };

  if (!isManagerAccessActive) return null;

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Banknote className="h-5 w-5 text-primary" />Record cash movement</CardTitle>
        <CardDescription>Record money removed from an open drawer. Sales add cash; refunds, drops, and payouts remove cash.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-amber-900 dark:text-amber-100">Both cash drops and payouts leave the drawer and reduce the shift&apos;s expected closeout amount.</p>
        </div>
        {isLoadingShifts ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : openShifts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            No open register shifts match the selected filters.
          </div>
        ) : (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cash-event-shift">Open register shift</Label>
              <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                <SelectTrigger id="cash-event-shift"><SelectValue placeholder="Choose an open shift" /></SelectTrigger>
                <SelectContent>
                  {openShifts.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {[shift.storeName, shift.registerName].filter(Boolean).join(" / ") || shift.registerId}
                      {" — "}{shift.cashierName || "Unknown cashier"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-event-type">Movement</Label>
              <Select value={eventType} onValueChange={(value) => setEventType(value as "drop" | "payout")}>
                <SelectTrigger id="cash-event-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="drop">Cash drop</SelectItem>
                  <SelectItem value="payout">Cash payout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-event-amount">Amount removed</Label>
              <Input id="cash-event-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cash-event-reason">Reason</Label>
              <Textarea id="cash-event-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this money leaving the drawer?" maxLength={500} required />
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button type="submit" disabled={createCashEvent.isPending}>
                {createCashEvent.isPending ? "Recording..." : `Record ${eventType === "drop" ? "cash drop" : "cash payout"}`}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsCash() {
  const { startDate, endDate, storeId, registerId, shiftId, cashierId } = useReportsContext();

  const { data: response, isLoading } = useGetCashReport({
    startDate,
    endDate,
    ...(storeId ? { storeId } : {}),
    ...(registerId ? { registerId } : {}),
    ...(shiftId ? { shiftId } : {}),
    ...(cashierId ? { cashierId } : {}),
  });

  const events = (response as any)?.data || [];
  const movements = (response as any)?.movements || [];
  const settlementParams = {
    status: "closed" as const,
    startDate,
    endDate,
    ...(storeId ? { storeId } : {}),
    ...(registerId ? { registerId } : {}),
    ...(cashierId ? { cashierId } : {}),
  };
  const { data: settlementsResponse, isLoading: isLoadingSettlements } = useListRegisterShifts(
    settlementParams,
    { query: { queryKey: getListRegisterShiftsQueryKey(settlementParams) } },
  );
  const settlements = (settlementsResponse as any)?.data || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CashEventRecorder {...{ storeId, registerId, cashierId }} />
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription className="font-medium text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Cash Drops (Deposits)
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse w-24" />
            ) : (
              <div className="text-2xl font-display font-bold text-foreground">
                {formatCurrency(events.filter((e: any) => e.type === 'drop').reduce((sum: number, e: any) => sum + Math.abs(Number(e.amount)), 0))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription className="font-medium text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-destructive" />
              Cash Payouts (Expenses)
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse w-24" />
            ) : (
              <div className="text-2xl font-display font-bold text-foreground">
                {formatCurrency(events.filter((e: any) => e.type === 'payout').reduce((sum: number, e: any) => sum + Math.abs(Number(e.amount)), 0))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium text-right">Events</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24 ml-auto" /></td>
                  </tr>
                ))
              ) : events.length > 0 ? (
                events.map((e: any) => (
                  <tr key={e.id ?? e.type} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                      <Badge variant={e.type === 'drop' ? 'default' : 'destructive'} className="text-[10px] uppercase">
                          {String(e.type ?? "unknown").replace("_", " ")}
                      </Badge>
                    </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {Number(e.count ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={e.type === 'sale' ? 'text-emerald-500' : 'text-destructive'}>
                          {cashEventDisplayAmount(e)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                    <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Banknote className="h-8 w-8 mb-2 opacity-30" />
                      <p>No cash events recorded for this period.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle>Cash movement history</CardTitle>
          <CardDescription>Every cash drop and payout in the selected store, register, shift, and date range.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[24rem] overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10 text-xs text-muted-foreground uppercase bg-muted/50 border-y">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Movement</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Recorded by</th>
                  <th className="px-4 py-3 font-medium">Store / register</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index} className="border-b last:border-0">
                      {Array.from({ length: 6 }).map((__, cellIndex) => <td key={cellIndex} className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></td>)}
                    </tr>
                  ))
                ) : movements.length > 0 ? (
                  movements.map((movement: any) => (
                    <tr key={movement.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{movement.createdAt ? format(parseISO(movement.createdAt), "MMM d, yyyy h:mm a") : "—"}</td>
                      <td className="px-4 py-3"><Badge variant={movement.type === "drop" ? "default" : "destructive"} className="text-[10px] uppercase">{movement.type}</Badge></td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-destructive">{cashEventDisplayAmount(movement)}</td>
                      <td className="px-4 py-3 min-w-48">{movement.reason || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{movement.recordedByName || "Unknown manager"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{movement.storeName || movement.storeId || "Unknown store"}</div>
                        <div className="text-xs">{movement.registerName || movement.registerId || "Unknown register"}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground"><Banknote className="mx-auto mb-2 h-8 w-8 opacity-30" />No cash drops or payouts recorded for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />Closed cashier-day settlements</CardTitle>
          <CardDescription>Review the physical closeout against the expected drawer balance for each register.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[24rem] overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10 text-xs text-muted-foreground uppercase bg-muted/50 border-y">
                <tr>
                  <th className="px-4 py-3 font-medium">Closed</th>
                  <th className="px-4 py-3 font-medium">Store / Register</th>
                  <th className="px-4 py-3 font-medium">Cashier</th>
                  <th className="px-4 py-3 font-medium text-right">Opening float</th>
                  <th className="px-4 py-3 font-medium text-right">Expected</th>
                  <th className="px-4 py-3 font-medium text-right">Counted</th>
                  <th className="px-4 py-3 font-medium text-right">Variance</th>
                  <th className="px-4 py-3 font-medium">Settled by</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingSettlements ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index} className="border-b last:border-0">
                      {Array.from({ length: 8 }).map((__, cellIndex) => <td key={cellIndex} className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></td>)}
                    </tr>
                  ))
                ) : settlements.length > 0 ? (
                  settlements.map((settlement: any) => {
                    const variance = Number(settlement.variance ?? 0);
                    return (
                      <tr key={settlement.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-settlement-${settlement.id}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground" data-testid={`text-settlement-closed-${settlement.id}`}>
                          {settlement.closedAt ? format(parseISO(settlement.closedAt), "MMM d, yyyy h:mm a") : "—"}
                        </td>
                        <td className="px-4 py-3" data-testid={`text-settlement-register-${settlement.id}`}>
                          <div className="font-medium">{settlement.registerName || settlement.registerId}</div>
                          <div className="text-xs text-muted-foreground">{settlement.storeName || settlement.storeId}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-settlement-cashier-${settlement.id}`}>{settlement.cashierName || "Unknown"}</td>
                        <td className="px-4 py-3 text-right font-mono" data-testid={`text-settlement-opening-${settlement.id}`}>{formatCurrency(Number(settlement.openingCash ?? 0))}</td>
                        <td className="px-4 py-3 text-right font-mono" data-testid={`text-settlement-expected-${settlement.id}`}>{formatCurrency(Number(settlement.expectedCash ?? 0))}</td>
                        <td className="px-4 py-3 text-right font-mono" data-testid={`text-settlement-counted-${settlement.id}`}>{formatCurrency(Number(settlement.closingCash ?? 0))}</td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${variance === 0 ? "text-emerald-600" : variance > 0 ? "text-blue-600" : "text-destructive"}`} data-testid={`text-settlement-variance-${settlement.id}`}>
                          {variance > 0 ? "+" : ""}{formatCurrency(variance)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-settlement-settled-by-${settlement.id}`}>{settlement.settledByName || settlement.closedBy || "Unknown"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground" data-testid="text-settlements-empty">
                      <ClipboardCheck className="mx-auto mb-2 h-8 w-8 opacity-30" />
                      No closed cashier days match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
