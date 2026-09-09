import React from "react";
import { useReportsContext } from "./context";
import { getListRegisterShiftsQueryKey, useGetCashReport, useListRegisterShifts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Banknote, ClipboardCheck, TrendingDown, TrendingUp } from "lucide-react";

export default function ReportsCash() {
  const { startDate, endDate, storeId, registerId, cashierId } = useReportsContext();

  const { data: response, isLoading } = useGetCashReport({
    startDate,
    endDate,
    ...(storeId ? { storeId } : {})
  });

  const events = (response as any)?.data || [];
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
                {formatCurrency(events.filter((e: any) => e.type === 'drop').reduce((sum: number, e: any) => sum + Number(e.amount), 0))}
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
                {formatCurrency(events.filter((e: any) => e.type === 'payout').reduce((sum: number, e: any) => sum + Number(e.amount), 0))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
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
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                      <Badge variant={e.type === 'drop' ? 'default' : 'destructive'} className="text-[10px] uppercase">
                          {String(e.type ?? "unknown").replace("_", " ")}
                      </Badge>
                    </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {Number(e.count ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={e.type === 'drop' ? 'text-emerald-500' : 'text-destructive'}>
                          {e.type === 'drop' ? '+' : '-'}{formatCurrency(e.amount)}
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
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />Closed cashier-day settlements</CardTitle>
          <CardDescription>Review the physical closeout against the expected drawer balance for each register.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
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
