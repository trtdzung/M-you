/**
 * Budget evaluation. Used amount comes from posted net expense per category
 * (same rule as cash flow). Exposes pressure facts consumed by insights.
 */

import type { Budget, Transaction } from "@/domain/models";
import { CATEGORY_BY_ID } from "@/domain/models";
import { netExpenseByCategory } from "./cashflow";
import type { Period } from "./types";

export type BudgetStatus = "ok" | "near" | "over";

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

const NEAR_THRESHOLD = 0.8;

function statusOf(used: number, limit: number): BudgetStatus {
  if (limit <= 0) return "ok";
  if (used > limit) return "over";
  if (used / limit >= NEAR_THRESHOLD) return "near";
  return "ok";
}

function daysLeftIn(period: Period, now: Date): number {
  const end = new Date(period.to).getTime();
  const diff = end - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86_400_000);
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
