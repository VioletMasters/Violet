export type PrinterSelectionCandidate = {
  id: string;
  role: string;
  isActive: boolean;
  isDefault: boolean;
  storeId?: string | null;
  registerId?: string | null;
  createdAt?: string | Date;
};

function scopeRank(printer: PrinterSelectionCandidate, storeId: string | null, registerId: string | null) {
  return (printer.registerId && printer.registerId === registerId ? 4 : 0)
    + (printer.storeId && printer.storeId === storeId ? 2 : 0)
    + (printer.isDefault ? 1 : 0);
}

export function selectEffectivePrinter<T extends PrinterSelectionCandidate>(
  candidates: T[],
  role: string,
  storeId: string | null,
  registerId: string | null,
): T | null {
  return candidates
    .filter((printer) => printer.role === role && printer.isActive)
    .filter((printer) => !printer.storeId || printer.storeId === storeId)
    .filter((printer) => !printer.registerId || printer.registerId === registerId)
    .sort((a, b) => {
      const rankDifference = scopeRank(b, storeId, registerId) - scopeRank(a, storeId, registerId);
      const aCreatedAt = a.createdAt instanceof Date ? a.createdAt.getTime() : Date.parse(a.createdAt ?? "");
      const bCreatedAt = b.createdAt instanceof Date ? b.createdAt.getTime() : Date.parse(b.createdAt ?? "");
      return rankDifference || aCreatedAt - bCreatedAt;
    })[0] ?? null;
}