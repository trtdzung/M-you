/**
 * Is there enough spending data for a recap at all? Gates the whole deck and feeds
 * the Tổng quan entry card, so it is exported standalone.
 */

import { UNCLASSIFIED, type Transaction } from "@/domain/models";
import { MIN_EXPENSE_TXNS, MIN_MONTHS, WRAPPED_MONTHS } from "./wrapped-thresholds";
import { wrappedMonthKeys, wrappedPeriod } from "./wrapped-period";
import { countedRows, monthHasExpenseData } from "./wrapped-txn-rules";
import { pctOf } from "./wrapped-fact";
import type { WrappedCoverage } from "./wrapped-types";

export function wrappedCoverage(transactions: Transaction[], endMonthKey: string): WrappedCoverage {
  const monthKeys = wrappedMonthKeys(endMonthKey);
  const rows = countedRows(transactions, wrappedPeriod(monthKeys));

  const monthsWithData = monthKeys.filter((key) => monthHasExpenseData(transactions, key)).length;
  const countedExpenseCount = rows.filter((r) => r.contribution > 0).length;

  let total = 0;
  let unclassified = 0;
  for (const { txn, contribution } of rows) {
    total += contribution;
    if (txn.categoryId === UNCLASSIFIED) unclassified += contribution;
  }

  const enoughMonths = monthsWithData >= MIN_MONTHS;
  const enoughTxns = countedExpenseCount >= MIN_EXPENSE_TXNS;
  const sufficient = enoughMonths && enoughTxns;
  return {
    monthsWithData,
    monthsTotal: WRAPPED_MONTHS,
    countedExpenseCount,
    unclassifiedPct: pctOf(unclassified, total),
    sufficient,
    ...(sufficient ? {} : { insufficientReason: enoughMonths ? ("transactions" as const) : ("months" as const) }),
  };
}
