import assert from "node:assert/strict";
import { selectEffectivePrinter, type PrinterSelectionCandidate } from "./printer-selection";

function printer(overrides: Partial<PrinterSelectionCandidate>): PrinterSelectionCandidate {
  return {
    id: "global",
    role: "customer_receipt",
    isActive: true,
    isDefault: true,
    storeId: null,
    registerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const candidates = [
  printer({ id: "global" }),
  printer({ id: "store-default", storeId: "store-1", isDefault: true }),
  printer({ id: "register", storeId: "store-1", registerId: "register-1", isDefault: false }),
  printer({ id: "other-store", storeId: "store-2" }),
  printer({ id: "inactive", isActive: false }),
];

assert.equal(
  selectEffectivePrinter(candidates, "customer_receipt", "store-1", "register-1")?.id,
  "register",
  "register match rank 4 beats store default rank 3",
);
assert.equal(
  selectEffectivePrinter(candidates, "customer_receipt", "store-1", "register-2")?.id,
  "store-default",
  "store default beats global default",
);
assert.equal(
  selectEffectivePrinter(
    [printer({ id: "global" }), printer({ id: "other-store", storeId: "store-2" })],
    "customer_receipt",
    "store-1",
    "register-9",
  )?.id,
  "global",
  "a printer scoped to another store is excluded",
);
assert.equal(
  selectEffectivePrinter(
    [
      printer({ id: "later", createdAt: "2026-02-01T00:00:00.000Z" }),
      printer({ id: "earlier", createdAt: "2026-01-01T00:00:00.000Z" }),
    ],
    "customer_receipt",
    null,
    null,
  )?.id,
  "earlier",
  "same-rank defaults use earliest createdAt",
);
assert.equal(
  selectEffectivePrinter(candidates, "warehouse", "store-1", "register-1"),
  null,
  "printers for another role are never treated as receipt destinations",
);

console.log("Effective printer selection verification passed.");