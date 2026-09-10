export type RetailPriceMode = "manual" | "markup";

export function isValidMarkupPercentage(value: string | number): boolean {
  if (value === "" || (typeof value === "string" && value.trim() === "")) return false;

  const markup = Number(value);
  return Number.isFinite(markup) && markup >= 0 && markup <= 100;
}

export function calculateRetailPrice(costPrice: number, markupPercentage: string | number): number | null {
  if (!Number.isFinite(costPrice) || costPrice < 0 || !isValidMarkupPercentage(markupPercentage)) {
    return null;
  }

  const markup = Number(markupPercentage);
  return Math.round((costPrice * (1 + markup / 100) + Number.EPSILON) * 100) / 100;
}

export function resolveRetailPrice(input: {
  mode: RetailPriceMode;
  manualPrice: number;
  costPrice: number;
  markupPercentage: string | number;
}): number | null {
  if (input.mode === "manual") return input.manualPrice;
  return calculateRetailPrice(input.costPrice, input.markupPercentage);
}