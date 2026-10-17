import "server-only";

import { liveTxns } from "@/app/api/jars/jar-write-guards";
import { aggregateCashflow, inPeriod } from "@/domain/engine/cashflow";
import { addMonthsToKey, dateToMonthKey, monthPeriodFromKey } from "@/domain/engine/types";
import type { CategoryAverage } from "../engine/levers/cut-category";
import type { MonthCashflow } from "../engine/surplus";

export interface GoalCashflowInput {
  months: MonthCashflow[];
  categoryAverages: CategoryAverage[];
}

const MONTHS_BACK = 3;

/** Last 3 fully ended months before `now`'s month, folded into engine input. */
export function goalCashflowInput(cif: string, now: Date): GoalCashflowInput {
  const txns = liveTxns(cif);
  const current = dateToMonthKey(now);
  const months: MonthCashflow[] = [];
  const categoryTotals = new Map<string, number>();

  for (let back = MONTHS_BACK; back >= 1; back--) {
    const monthKey = addMonthsToKey(current, -back);
    const period = monthPeriodFromKey(monthKey);
    const cashflow = aggregateCashflow(txns, period, new Set());
    const txnCount = txns.filter((t) => t.status !== "reversed" && inPeriod(t, period)).length;
    months.push({ monthKey, income: cashflow.income, expense: cashflow.expense, txnCount });
    if (txnCount === 0) continue;
    for (const c of cashflow.byCategory) {
      categoryTotals.set(c.categoryId, (categoryTotals.get(c.categoryId) ?? 0) + c.amount);
    }
  }

  const monthsUsed = months.filter((m) => m.txnCount > 0).length;
  const categoryAverages = [...categoryTotals]
    .filter(([, total]) => total > 0 && monthsUsed > 0)
    .map(([categoryId, total]) => ({ categoryId, average: Math.round(total / monthsUsed) }));
  return { months, categoryAverages };
}
