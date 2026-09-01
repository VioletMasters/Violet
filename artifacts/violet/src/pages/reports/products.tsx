import React from "react";
import { useReportsContext } from "./context";
import { useGetProductReport } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Package, ArrowDown, ArrowUp } from "lucide-react";

export default function ReportsProducts() {
  const { startDate, endDate, storeId } = useReportsContext();

  const { data: response, isLoading } = useGetProductReport({
    startDate,
    endDate,
    ...(storeId ? { storeId } : {})
  });

  const products = (response as any)?.data || [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Qty Sold</th>
                <th className="px-4 py-3 font-medium text-right">Gross Sales</th>
                <th className="px-4 py-3 font-medium text-right">Net Sales</th>
                <th className="px-4 py-3 font-medium text-right">COGS</th>
                <th className="px-4 py-3 font-medium text-right">Gross Profit</th>
                <th className="px-4 py-3 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : products.length > 0 ? (
                products.map((p: any) => {
                  const margin = Number(p.margin) || 0;
                  return (
                    <tr key={p.productId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {p.productName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.category || 'Uncategorized'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {p.quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(p.gross)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground font-medium">
                        {formatCurrency(p.net)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(p.cogs)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground font-medium">
                        {formatCurrency(p.profit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <div className="flex items-center justify-end gap-1">
                          <span className={margin < 0 ? "text-destructive" : margin > 50 ? "text-emerald-500" : "text-foreground"}>
                            {margin}%
                          </span>
                          {margin < 0 && <ArrowDown className="w-3 h-3 text-destructive" />}
                          {margin > 50 && <ArrowUp className="w-3 h-3 text-emerald-500" />}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Package className="h-8 w-8 mb-2 opacity-30" />
                      <p>No product sales data for this period.</p>
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
