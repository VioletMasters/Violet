import React from "react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardStats, useGetSalesTrend, useGetRecentSales, useGetTopProducts } from "@workspace/api-client-react";
import { DollarSign, Package, Users, AlertTriangle, ArrowUpRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: trendData, isLoading: trendLoading } = useGetSalesTrend();
  const { data: recentSales, isLoading: salesLoading } = useGetRecentSales();
  const { data: topProducts, isLoading: topProductsLoading } = useGetTopProducts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold tracking-tight">Overview</h1>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card hover-elevate border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse w-24"></div>
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(stats?.todayRevenue || 0)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {statsLoading ? "" : `${stats?.totalSalesToday || 0} sales today`}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card hover-elevate border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse w-24"></div>
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(stats?.weekRevenue || 0)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Monthly: {formatCurrency(stats?.monthRevenue || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card hover-elevate border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products & Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse w-24"></div>
            ) : (
              <div className="text-2xl font-bold">{stats?.totalProducts || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.totalCustomers || 0} registered customers
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card hover-elevate border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats?.lowStockCount ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse w-24"></div>
            ) : (
              <div className={`text-2xl font-bold ${stats?.lowStockCount ? 'text-destructive' : ''}`}>
                {stats?.lowStockCount || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Items need attention
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-4 lg:col-span-5 border-border/50">
          <CardHeader>
            <CardTitle>Sales Trend (30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {trendLoading ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading chart...</div>
            ) : trendData && trendData.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
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
                      labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground border border-dashed rounded-lg">
                No sales data for the last 30 days
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3 lg:col-span-2 border-border/50">
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            {topProductsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-muted rounded animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : topProducts && topProducts.length > 0 ? (
              <div className="space-y-6">
                {topProducts.map((product, i) => (
                  <div key={product.productId} className="flex items-center">
                    <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center text-secondary-foreground font-bold mr-4 shrink-0">
                      {i + 1}
                    </div>
                    <div className="ml-0 space-y-1 overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {product.totalSold} sold
                      </p>
                    </div>
                    <div className="ml-auto font-medium">
                      {formatCurrency(product.totalRevenue)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 border border-dashed rounded-lg">
                No product data
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Sales Table */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Recent Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {salesLoading ? (
             <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse w-full" />)}
             </div>
          ) : recentSales && recentSales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-3 font-medium">Receipt</th>
                    <th className="py-3 font-medium">Date</th>
                    <th className="py-3 font-medium">Customer</th>
                    <th className="py-3 font-medium text-right">Amount</th>
                    <th className="py-3 font-medium text-right">Method</th>
                    <th className="py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-mono">{sale.receiptNumber || sale.id.substring(0, 8)}</td>
                      <td className="py-3 text-muted-foreground">{new Date(sale.createdAt).toLocaleString()}</td>
                      <td className="py-3">{sale.customerName || "Walk-in"}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(sale.totalAmount)}</td>
                      <td className="py-3 text-right capitalize">{sale.paymentMethod.replace('_', ' ')}</td>
                      <td className="py-3 text-right">
                        <Badge variant={sale.status === 'completed' ? 'success' : 'secondary'}>
                          {sale.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8 border border-dashed rounded-lg">
              No recent sales
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}