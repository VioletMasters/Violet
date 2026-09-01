import React from "react";
import { useReportsContext } from "./context";
import { useGetStoreReport } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Store } from "lucide-react";

export default function ReportsStores() {
  const { startDate, endDate } = useReportsContext();

  const { data: response, isLoading } = useGetStoreReport({
    startDate,
    endDate
  });

  const stores = (response as any)?.data || [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium text-right">Transactions</th>
                <th className="px-4 py-3 font-medium text-right">Net Sales</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24 ml-auto" /></td>
                  </tr>
                ))
              ) : stores.length > 0 ? (
                stores.map((s: any) => (
                  <tr key={s.storeId || 'unknown'} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {s.storeName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {s.transactions}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                      {formatCurrency(s.sales)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Store className="h-8 w-8 mb-2 opacity-30" />
                      <p>No store sales data for this period.</p>
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
