export interface MonthCashflow {
  monthKey: string;
  income: number;
  expense: number;
  txnCount: number;
}

export interface AverageSurplus {
  value: number | "unknown";
  monthsUsed: number;
}

/**
 * Mean of (income - expense) over months that have data. Months without any
 * transaction are skipped; no usable month -> "unknown". Sign is preserved.
 */
export function averageSurplus(months: MonthCashflow[]): AverageSurplus {
  const used = months.filter((m) => m.txnCount > 0);
  if (used.length === 0) return { value: "unknown", monthsUsed: 0 };
  const total = used.reduce((sum, m) => sum + (m.income - m.expense), 0);
  return { value: Math.round(total / used.length), monthsUsed: used.length };
}
