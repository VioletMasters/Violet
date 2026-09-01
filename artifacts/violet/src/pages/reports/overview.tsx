import React from "react";
import { useReportsContext } from "./context";
import { useGetReportingSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { AlertCircle, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

function MetricCard({ title, value, prefix = "", loading = false }: { title: string, value?: number | string, prefix?: string, loading?: boolean }) {
  const isCurrency = prefix === "$";
  const displayValue = value === undefined ? "-" : isCurrency ? formatCurrency(Number(value)) : value.toString();
  
  return (
    <Card className="bg-card shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardDescription className="font-medium text-xs uppercase tracking-wider">{title}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <div className="h-8 bg-muted rounded animate-pulse w-24" />
        ) : (
          <div className="text-2xl font-display font-bold text-foreground">
            {displayValue}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsOverview() {
  const { startDate, endDate, storeId, registerId, cashierId } = useReportsContext();

  const { data: reportData, isLoading } = useGetReportingSummary({
    startDate,
    endDate,
    ...(storeId ? { storeId } : {}),
    ...(registerId ? { registerId } : {}),
    ...(cashierId ? { cashierId } : {})
  });

  const summary = (reportData as any)?.summary || {};
  const trend = (reportData as any)?.trend || [];
  
  const hasData = trend.length > 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <MetricCard title="Gross Sales" value={summary.grossSales} prefix="$" loading={isLoading} />
        <MetricCard title="Net Sales" value={summary.netSales} prefix="$" loading={isLoading} />
        <MetricCard title="Discounts" value={summary.discounts} prefix="$" loading={isLoading} />
        <MetricCard title="Refunds" value={summary.totalRefunds} prefix="$" loading={isLoading} />
        <MetricCard title="Total Tax" value={summary.totalTax} prefix="$" loading={isLoading} />
        
        <MetricCard title="Cost of Goods" value={summary.costOfGoods} prefix="$" loading={isLoading} />
        <MetricCard title="Gross Profit" value={summary.grossProfit} prefix="$" loading={isLoading} />
        <MetricCard title="Margin %" value={summary.grossMargin ? `${summary.grossMargin}%` : undefined} loading={isLoading} />
        <MetricCard title="Transaction Count" value={summary.transactionCount} loading={isLoading} />
        <MetricCard title="Avg Order Value" value={summary.averageOrderValue} prefix="$" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Revenue Trend</CardTitle>
            <CardDescription>Daily net sales for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[350px] flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center gap-2 text-muted-foreground">
                  <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Loading chart...
                </div>
              </div>
            ) : hasData ? (
              <div className="h-[350px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevRep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                        try {
                          const d = parseISO(val);
                          return format(d, 'MMM d');
                        } catch {
                          return val;
                        }
                      }}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      fontFamily="var(--app-font-mono)"
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      tickFormatter={(val) => `$${val}`}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      fontFamily="var(--app-font-mono)"
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Net Sales"]}
                      labelFormatter={(label) => {
                        try {
                          const d = parseISO(label);
                          return format(d, 'EEEE, MMMM d, yyyy');
                        } catch {
                          return label;
                        }
                      }}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px", fontFamily: "var(--app-font-sans)" }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRevRep)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[350px] flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                <p>No revenue data available for this range</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Payment Methods</CardTitle>
            <CardDescription>Breakdown by tender type</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-4 mt-2">
                {((reportData as any)?.payments || []).map((p: any) => (
                  <div key={p.method} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">{p.method.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">{p.count} transactions</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono">{formatCurrency(p.amount)}</p>
                    </div>
                  </div>
                ))}
                
                {((reportData as any)?.payments || []).length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/20">
                    No payment data found
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
