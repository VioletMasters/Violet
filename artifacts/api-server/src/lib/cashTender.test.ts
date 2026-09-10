import assert from "node:assert/strict";
import { summarizeCashTender } from "./cashTender";

assert.deepEqual(
  summarizeCashTender([
    { method: "cash", amount: "45.00", tenderedAmount: "50.00" },
  ]),
  { amount: 45, received: 50, changeDue: 5 },
  "Cash history must expose persisted cash received and change due.",
);

for (const method of ["card", "bank_transfer", "store_credit", "gift_card"]) {
  assert.equal(
    summarizeCashTender([{ method, amount: 45 }]),
    null,
    `${method} history must not expose cash fields.`,
  );
}

assert.deepEqual(
  summarizeCashTender([
    { method: "cash", amount: 20, tenderedAmount: 25 },
    { method: "cash", amount: 15, tenderedAmount: 20 },
    { method: "card", amount: 10 },
  ]),
  { amount: 35, received: 45, changeDue: 10 },
  "Split cash history must aggregate only the cash tender rows.",
);

assert.deepEqual(
  summarizeCashTender([], {
    paymentMethod: "cash",
    totalAmount: "42.50",
    cashTendered: "50.00",
  }),
  { amount: 42.5, received: 50, changeDue: 7.5 },
  "Legacy cashTendered sales must remain compatible with cash history.",
);

assert.equal(
  summarizeCashTender([], {
    paymentMethod: "card",
    totalAmount: 42.5,
    cashTendered: 50,
  }),
  null,
  "Legacy cashTendered data must not create cash fields for non-cash sales.",
);

console.log("Cash tender history verification passed.");