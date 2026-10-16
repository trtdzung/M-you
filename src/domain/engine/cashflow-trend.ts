/**
 * Multi-month thu/chi trend — the primary cash-flow visual. Reuses the
 * single-month `aggregateCashflow` rule per month (DRY) so transfers, refunds
 * and reversals are excluded identically everywhere. Each point carries money-in
 * (`income`, a single aggregate) and `expense`.
 *
 * Red Team H3: `aggregateCashflow` returns expense:0 for BOTH a truly empty
 * month and a month that predates any data. Its only tell is
 * `meta.freshness === null`, so each point carries `hasData`; the UI renders a
 * no-data month as a gap/dash, never a misleading 0đ bar (invariant #6).
 */

import type { Transaction } from "@/domain/models";
import { aggregateCashflow } from "./cashflow";
import { addMonthsToKey, monthPeriodFromKey } from "./types";

export interface CashflowTrendPoint {
  /** "YYYY-MM". */
  month: string;
  /** Money-in for the month (aggregate "Tiền vào"). */
  income: number;
  expense: number;
  /** False when the month has no underlying data (render as gap, not 0). */
  hasData: boolean;
}

export interface CashflowTrend {
  /** Chronological, oldest → newest, one entry per month in the window. */
  points: CashflowTrendPoint[];
  meta: {
    /** Freshness of the most recent record with data, or null. */
    freshness: string | null;
  };
}

/**
 * Cash-flow for each of the `monthsBack` months ending at `endMonthKey`
 * (inclusive). Deterministic. Caller should memoize — this runs one full
 * aggregation per month.
 */
export function cashflowTrend(
  txns: Transaction[],
  endMonthKey: string,
  monthsBack = 6,
): CashflowTrend {
  const points: CashflowTrendPoint[] = [];
  let freshest: string | null = null;

  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthKey = addMonthsToKey(endMonthKey, -i);
    const result = aggregateCashflow(txns, monthPeriodFromKey(monthKey));
    const hasData = result.meta.freshness !== null;
    if (hasData && (freshest === null || result.meta.freshness! > freshest)) {
      freshest = result.meta.freshness;
    }
    points.push({
      month: monthKey,
      income: result.income,
      expense: result.expense,
      hasData,
    });
  }

  return { points, meta: { freshness: freshest } };
}
