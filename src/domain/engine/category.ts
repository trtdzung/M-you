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
  /** Share of total expense in [0, 1]. */
  share: number;
}

export function spendingByCategory(txns: Transaction[], period: Period, topN?: number): CategorySpend[] {
  const byCat = netExpenseByCategory(txns, period);
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
