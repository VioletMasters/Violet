import React from "react";
import { useGetInventoryReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Package, AlertTriangle, DollarSign } from "lucide-react";

export default function ReportsInventory() {
  const { data: invReport, isLoading } = useGetInventoryReport();
  const topCategories = invReport?.topCategories || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card shadow-sm border-border/50">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Value</p>
              <div className="text-2xl font-display font-bold">
                {isLoading ? <span className="opacity-50">...</span> : formatCurrency(invReport?.totalValue || 0)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border/50">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-secondary flex items-center justify-center text-secondary-foreground">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Products in Stock</p>
              <div className="text-2xl font-display font-bold">
                {isLoading ? <span className="opacity-50">...</span> : invReport?.totalProducts || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border/50">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Needs Attention</p>
              <div className="text-2xl font-display font-bold text-destructive">
                {isLoading ? <span className="opacity-50">...</span> : (invReport?.lowStockCount || 0) + (invReport?.outOfStockCount || 0)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Inventory by Category</CardTitle>
          <CardDescription>Value distribution across product lines</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Products</th>
                  <th className="px-4 py-3 font-medium text-right">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-12 ml-auto" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24 ml-auto" /></td>
                    </tr>
                  ))
                ) : topCategories.length > 0 ? (
                  topCategories.map((c: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.categoryName || 'Uncategorized'}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.productCount}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(c.totalValue)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                      No category data available.
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
