import { useGetInventoryReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, CircleDollarSign, Landmark, ShoppingBag, TrendingUp } from "lucide-react";

export default function ReportsInventory() {
  const { data: report, isLoading, isError, refetch } = useGetInventoryReport();
  const rows = report?.data ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-display font-bold">Inventory financial value</h2>
        <p className="text-sm text-muted-foreground">Understand what current stock cost and what it could return at current selling prices.</p>
      </div>

      {isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
          <p className="font-medium">Inventory values could not be loaded.</p>
          <button className="mt-3 text-sm font-medium text-primary underline" onClick={() => void refetch()}>Try again</button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Inventory at cost", value: report?.totalCostValue, detail: "On hand × recorded cost", icon: Landmark },
              { label: "Expected retail value", value: report?.totalRetailValue, detail: "On hand × current sale price", icon: CircleDollarSign },
              { label: "Projected gross profit", value: report?.projectedGrossProfit, detail: report?.projectedGrossMargin == null ? "Add missing costs to calculate" : `${report.projectedGrossMargin.toFixed(1)}% projected margin`, icon: TrendingUp },
              { label: "Received inventory spend", value: report?.receivedInventoryCost, detail: "Received units × received cost", icon: ShoppingBag },
            ].map(({ label, value, detail, icon: Icon }) => (
              <Card key={label} className="border-border/50 shadow-sm">
                <CardContent className="flex items-start gap-4 pt-6">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-1 text-2xl font-display font-bold">{isLoading ? "…" : value == null ? "Incomplete" : formatCurrency(value)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!!report?.missingCostCount && (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <span><strong>{report.missingCostCount} on-hand products are missing a cost.</strong> Cost value is understated and projected profit remains incomplete.</span>
            </div>
          )}

          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Product-level valuation</CardTitle>
              <CardDescription>Every row reconciles current on-hand cost, retail value, and projected gross profit.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      {["Product", "SKU", "On hand", "Unit cost", "Sale price", "Cost value", "Retail value", "Projected profit"].map((label, index) => (
                        <th key={label} className={`px-4 py-3 font-medium ${index > 1 ? "text-right" : "text-left"}`}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!isLoading && rows.length ? rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{row.sku}</td>
                        <td className="px-4 py-3 text-right">{row.stock.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{row.costMissing ? <span className="text-amber-600">Missing</span> : formatCurrency(row.costPrice ?? 0)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.price)}</td>
                        <td className="px-4 py-3 text-right">{row.costMissing ? "Incomplete" : formatCurrency(row.costValue)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.retailValue)}</td>
                        <td className="px-4 py-3 text-right font-medium">{row.projectedGrossProfit == null ? "Incomplete" : formatCurrency(row.projectedGrossProfit)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">{isLoading ? "Loading inventory values…" : "No inventory records found."}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Purchasing context</CardTitle><CardDescription>Received stock and purchase orders are operational records, not proof of supplier payment.</CardDescription></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="rounded-lg bg-muted/40 p-4"><p className="text-sm text-muted-foreground">Open purchase commitments</p><p className="mt-1 text-xl font-bold">{formatCurrency(report?.purchaseOrderCommitments ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Ordered and partially received purchase orders.</p></div>
              <div className="rounded-lg bg-muted/40 p-4"><p className="text-sm text-muted-foreground">Actual supplier payments</p><p className="mt-1 text-xl font-bold">Not tracked</p><p className="mt-1 text-xs text-muted-foreground">Violet does not yet record invoice payment status or cash paid to suppliers.</p></div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
