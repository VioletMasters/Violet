export type CashTenderPayment = {
  method: string;
  amount: string | number;
  tenderedAmount?: string | number | null;
};

export type CashTenderSummary = {
  amount: number;
  received: number;
  changeDue: number;
};

export type CashTenderFallback = {
  paymentMethod: string;
  totalAmount: string | number;
  cashTendered?: string | number | null;
};

const money = (value: number) => Number(value.toFixed(2));

export function summarizeCashTender(
  payments: CashTenderPayment[],
  fallback?: CashTenderFallback,
): CashTenderSummary | null {
  const cashPayments = payments.filter((payment) => payment.method === "cash");
  if (cashPayments.length === 0) {
    if (fallback?.paymentMethod !== "cash" || fallback.cashTendered == null) return null;
    const amount = Number(fallback.totalAmount);
    const received = Number(fallback.cashTendered);
    if (!Number.isFinite(amount) || !Number.isFinite(received)) return null;
    return {
      amount: money(amount),
      received: money(received),
      changeDue: money(Math.max(0, received - amount)),
    };
  }

  const amount = cashPayments.reduce((total, payment) => total + Number(payment.amount), 0);
  const received = cashPayments.reduce(
    (total, payment) => total + Number(payment.tenderedAmount ?? payment.amount),
    0,
  );

  return {
    amount: money(amount),
    received: money(received),
    changeDue: money(Math.max(0, received - amount)),
  };
}