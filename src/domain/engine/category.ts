/**
 * Spending-by-category view. Reuses the cash-flow net-expense rule so refunds
 * and exclusions stay consistent across the app (DRY — one source of truth).
 */

import type { Transaction } from "@/domain/models";
import { categoryLabel } from "@/domain/models";
import { netExpenseByCategory } from "./cashflow";
import type { Period } from "./types";

export interface CategorySpend {
  categoryId: string;
  label: string;
  amount: number;
  /** Share of total in [0, 1]. */
  share: number;
}

function toRows(
  byCat: Map<string, number>,
  topN?: number,
  labels?: ReadonlyMap<string, string>,
): CategorySpend[] {
  const total = Array.from(byCat.values()).reduce((s, v) => s + Math.max(0, v), 0);
  const rows: CategorySpend[] = Array.from(byCat.entries())
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({
      categoryId,
      label: categoryLabel(categoryId, labels),
      amount,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  return typeof topN === "number" ? rows.slice(0, topN) : rows;
}

/**
 * `labels` is the persona's stored id→label map (`useCategories().labels`).
 * Presentation only: it names the rows, never groups or sums them, so an absent
 * map costs a preset label (built-in fallback) or a raw id — never an amount.
 */
export function spendingByCategory(
  txns: Transaction[],
  period: Period,
  topN?: number,
  labels?: ReadonlyMap<string, string>,
): CategorySpend[] {
  return toRows(netExpenseByCategory(txns, period), topN, labels);
}
