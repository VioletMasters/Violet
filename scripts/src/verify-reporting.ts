import assert from "node:assert/strict";

type Line = { quantity: number; unitPrice: number; discount: number; unitCost: number | null };
type Sale = { status: "completed" | "refunded" | "voided"; tax: number; lines: Line[] };

function calculate(sales: Sale[]) {
  const completed = sales.filter((sale) => sale.status === "completed");
  const refunded = sales.filter((sale) => sale.status === "refunded");
  const grossSales = completed.flatMap((sale) => sale.lines).reduce((n, line) => n + line.unitPrice * line.quantity, 0);
  const discounts = completed.flatMap((sale) => sale.lines).reduce((n, line) => n + line.discount, 0);
  const refunds = refunded.flatMap((sale) => sale.lines).reduce((n, line) => n + line.unitPrice * line.quantity - line.discount, 0);
  const netSales = grossSales - discounts - refunds;
  const cogs = completed.flatMap((sale) => sale.lines).reduce((n, line) => n + (line.unitCost == null ? 0 : line.unitCost * line.quantity), 0);
  const missingCostLines = completed.flatMap((sale) => sale.lines).filter((line) => line.unitCost == null).length;
  const grossProfit = netSales - cogs;
  return { grossSales, discounts, refunds, netSales, cogs, grossProfit, margin: netSales ? grossProfit / netSales * 100 : 0, missingCostLines };
}

const result = calculate([
  { status: "completed", tax: 2.25, lines: [{ quantity: 2, unitPrice: 10, discount: 2, unitCost: 4 }, { quantity: 1, unitPrice: 5, discount: 0, unitCost: null }] },
  { status: "completed", tax: 1, lines: [{ quantity: 1, unitPrice: 20, discount: 5, unitCost: 8 }] },
  { status: "refunded", tax: 1, lines: [{ quantity: 1, unitPrice: 10, discount: 2, unitCost: 4 }] },
  { status: "voided", tax: 99, lines: [{ quantity: 99, unitPrice: 99, discount: 0, unitCost: 1 }] },
]);

assert.deepEqual(result, {
  grossSales: 45, discounts: 7, refunds: 8, netSales: 30, cogs: 16,
  grossProfit: 14, margin: 46.666666666666664, missingCostLines: 1,
});
console.log("Reporting financial definition verification passed.");
