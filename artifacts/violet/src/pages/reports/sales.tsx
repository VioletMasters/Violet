import React, { useState } from "react";
import { useReportsContext } from "./context";
import { useGetReportTransactions } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ReportsSales() {
  const { startDate, endDate, storeId } = useReportsContext();
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: response, isLoading } = useGetReportTransactions({
    startDate,
    endDate,
    ...(storeId ? { storeId } : {}),
    page,
    limit: 200 // The endpoint max is 200, let's use 50
  });

  const transactions = (response as any)?.data || [];
  const total = (response as any)?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center bg-card p-3 rounded-lg border shadow-sm">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search receipt number..." 
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="text-sm text-muted-foreground font-medium">
          {total} Transactions
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Receipt</th>
                <th className="px-4 py-3 font-medium">Date & Time</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Subtotal</th>
                <th className="px-4 py-3 font-medium text-right">Discount</th>
                <th className="px-4 py-3 font-medium text-right">Tax</th>
                <th className="px-4 py-3 font-medium text-right text-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : transactions.length > 0 ? (
                transactions.map((tx: any) => (
                  <tr key={tx.id || tx.receiptNumber} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-primary">
                      {tx.receiptNumber || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {format(parseISO(tx.createdAt), "MMM d, yyyy h:mm a")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'} className="text-[10px] uppercase">
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(tx.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(tx.discountAmount || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(tx.taxAmount || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {formatCurrency(tx.totalAmount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="h-8 w-8 mb-2 opacity-30" />
                      <p>No transactions found for this period.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <div className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
            </div>
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-8"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
