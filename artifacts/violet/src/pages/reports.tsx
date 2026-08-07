import React, { useState } from "react";
import { useGetSalesReport, useGetInventoryReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { subDays, format } from "date-fns";
import { DollarSign, Package, AlertTriangle, ArrowRightLeft } from "lucide-react";

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState("30");
  
  const endDate = new Date().toISOString();
  const startDate = subDays(new Date(), parseInt(dateRange)).toISOString();
  const groupBy = dateRange === "7" ? "day" : dateRange === "30" ? "day" : "month";

  const { data: salesReport, isLoading: salesLoading } = useGetSalesReport({
    startDate,
    endDate,
    groupBy
  });

  const { data: invReport, isLoading: invLoading } = useGetInventoryReport();

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">Deep dive into your business performance</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Sales Performance</h2>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Total Revenue</CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading ? <div className="h-8 bg-muted rounded animate-pulse w-24" /> :
                <div className="text-3xl font-bold text-primary">{formatCurrency(salesReport?.totalRevenue || 0)}</div>
              }
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Total Orders</CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading ? <div className="h-8 bg-muted rounded animate-pulse w-24" /> :
                <div className="text-3xl font-bold">{salesReport?.totalOrders || 0}</div>
              }
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Avg Order Value</CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading ? <div className="h-8 bg-muted rounded animate-pulse w-24" /> :
                <div className="text-3xl font-bold">{formatCurrency(salesReport?.averageOrderValue || 0)}</div>
              }
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Refunds</CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading ? <div className="h-8 bg-muted rounded animate-pulse w-24" /> :
                <div className="text-3xl font-bold text-muted-foreground">{formatCurrency(salesReport?.totalRefunds || 0)}</div>
              }
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">Loading chart...</div>
            ) : salesReport?.data && salesReport.data.length > 0 ? (
              <div className="h-[350px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesReport.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                        const d = new Date(val);
                        return groupBy === 'month' ? format(d, 'MMM yyyy') : format(d, 'MMM d');
                      }}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      tickFormatter={(val) => `$${val}`}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                      labelFormatter={(label) => {
                        const d = new Date(label);
                        return groupBy === 'month' ? format(d, 'MMMM yyyy') : format(d, 'EEEE, MMMM d, yyyy');
                      }}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
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
              <div className="h-[350px] flex items-center justify-center text-muted-foreground border border-dashed rounded-lg">
                No data available for this range
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 pt-8 border-t border-border/50">
        <h2 className="text-xl font-bold">Inventory Status</h2>
        
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-card">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Inventory Value</p>
                <div className="text-2xl font-bold">{invLoading ? "..." : formatCurrency(invReport?.totalValue || 0)}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Package className="w-6 h-6 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unique Products</p>
                <div className="text-2xl font-bold">{invLoading ? "..." : invReport?.totalProducts || 0}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Needs Attention</p>
                <div className="text-2xl font-bold text-destructive">
                  {invLoading ? "..." : (invReport?.lowStockCount || 0) + (invReport?.outOfStockCount || 0)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}