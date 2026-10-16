/**
 * Budget evaluation. Used amount comes from posted net expense per category
 * (same rule as cash flow). Exposes pressure facts consumed by insights.
 */

import type { Budget, Transaction } from "@/domain/models";
import { CATEGORY_BY_ID } from "@/domain/models";
import { netExpenseByCategory } from "./cashflow";
import { daysLeftIn, statusOf, type PressureStatus } from "./pressure";
import type { Period } from "./types";

export type BudgetStatus = PressureStatus;

export interface BudgetLine {
  categoryId: string;
  label: string;
  limit: number;
  used: number;
  /** used / limit (0 when limit is 0). */
  pct: number;
  /** Whole days remaining in the period from `now` (>= 0). */
  daysLeft: number;
  status: BudgetStatus;
}

export function evaluateBudget(
  budgets: Budget[],
  txns: Transaction[],
  period: Period,
  now: Date = new Date(),
): BudgetLine[] {
  const byCat = netExpenseByCategory(txns, period);
  const daysLeft = daysLeftIn(period, now);

  return budgets.map((b) => {
    const used = Math.max(0, byCat.get(b.categoryId) ?? 0);
    return {
      categoryId: b.categoryId,
      label: CATEGORY_BY_ID[b.categoryId]?.label ?? b.categoryId,
      limit: b.limit,
      used,
      pct: b.limit > 0 ? used / b.limit : 0,
      daysLeft,
      status: statusOf(used, b.limit),
    };
  });
}
