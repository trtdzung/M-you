/**
 * Spending-by-category view. Reuses the cash-flow net-expense rule so refunds
 * and exclusions stay consistent across the app (DRY — one source of truth).
 */

import type { Transaction } from "@/domain/models";
import { CATEGORY_BY_ID } from "@/domain/models";
import { netExpenseByCategory } from "./cashflow";
import type { Period } from "./types";

export interface CategorySpend {
  categoryId: string;
  label: string;
  amount: number;
  /** Share of total in [0, 1]. */
  share: number;
}

function inPeriod(txn: Transaction, period: Period): boolean {
  return txn.postedAt >= period.from && txn.postedAt <= period.to;
}

function toRows(byCat: Map<string, number>, topN?: number): CategorySpend[] {
  const total = Array.from(byCat.values()).reduce((s, v) => s + Math.max(0, v), 0);
  const rows: CategorySpend[] = Array.from(byCat.entries())
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({
      categoryId,
      label: CATEGORY_BY_ID[categoryId]?.label ?? categoryId,
      amount,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  return typeof topN === "number" ? rows.slice(0, topN) : rows;
}

export function spendingByCategory(txns: Transaction[], period: Period, topN?: number): CategorySpend[] {
  return toRows(netExpenseByCategory(txns, period), topN);
}

/**
 * Income per category for posted transactions in the period (type === "income";
 * transfers and refunds are excluded, matching `aggregateCashflow`). Mirrors
 * `spendingByCategory` so the Báo cáo thu chi donut can toggle Thu nhập with the
 * same shape and provenance rules.
 */
export function incomeByCategory(txns: Transaction[], period: Period, topN?: number): CategorySpend[] {
  const byCat = new Map<string, number>();
  for (const t of txns) {
    if (t.status !== "posted" || t.type !== "income" || !inPeriod(t, period)) continue;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
  }
  return toRows(byCat, topN);
}
