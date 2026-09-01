import React from "react";
import { useReportsContext } from "./context";
import { useGetCashReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Banknote, TrendingDown, TrendingUp } from "lucide-react";

export default function ReportsCash() {
  const { startDate, endDate, storeId } = useReportsContext();

  const { data: response, isLoading } = useGetCashReport({
    startDate,
    endDate,
    ...(storeId ? { storeId } : {})
  });

  const events = (response as any)?.data || [];

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
                <th className="px-4 py-3 font-medium">Date & Time</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Register</th>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-48" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : events.length > 0 ? (
                events.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {format(parseISO(e.createdAt), "MMM d, yyyy h:mm a")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={e.type === 'drop' ? 'default' : 'destructive'} className="text-[10px] uppercase">
                        {e.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {e.reason}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.registerName || e.registerId}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.cashierName || 'Unknown'}
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
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
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
    </div>
  );
}
