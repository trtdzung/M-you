/**
 * Cash-flow aggregation — the core income/expense truth. `income` is money-IN as
 * a single aggregate ("Tiền vào") only: it has NO category breakdown (there are
 * no income categories) and never feeds `byCategory`.
 *
 * Rules enforced here (architectural invariants):
 *  - internal transfers and credit-card payments are excluded from income/expense
 *  - refunds reverse the matching expense category (applied as negative expense)
 *  - reversed transactions are excluded from all totals
 *  - pending is kept separate from posted
 */

import type { Transaction } from "@/domain/models";
import { isRebalanceCategory } from "@/domain/models";
import { coverageOf, isoInPeriod, type AggregateMeta, type Period } from "./types";

export interface CategoryAmount {
  categoryId: string;
  amount: number;
}

export interface CashflowResult {
  /** Money-in for the period (posted `income` txns). No category breakdown. */
  income: number;
  /** Net expense (gross expense − refunds), excludes transfers/card payments. */
  expense: number;
  /** Money-in minus expense; keeps its sign (never a false 0, invariant #6). */
  net: number;
  /** Net expense per category (may include refunds), positive-ish, sorted desc. */
  byCategory: CategoryAmount[];
  fixed: number;
  discretionary: number;
  /** Pending expense, reported separately from posted totals. */
  pendingExpense: number;
  meta: AggregateMeta;
}

const EXPENSE_TYPES: ReadonlySet<Transaction["type"]> = new Set(["expense", "fee"]);

/**
 * True when `txn.postedAt` falls within `period` (inclusive bounds). Compares real
 * instants (never ISO strings lexically), so a `+07:00`-suffixed timestamp lands in
 * its true VN month; an unparseable `postedAt` is in no period.
 */
export function inPeriod(txn: Transaction, period: Period): boolean {
  return isoInPeriod(txn.postedAt, period);
}

/** Net expense per category for posted transactions (gross − refunds). */
export function netExpenseByCategory(txns: Transaction[], period: Period): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const t of txns) {
    if (t.status !== "posted" || !inPeriod(t, period)) continue;
    // Inter-jar rebalance txns are a bookkeeping move, NOT spend — excluded from
    // spend-by-category + jar `spent` + cashflow expense exactly like a transfer
    // (invariant #6). The engine folds them into `remaining` via `rebalanceNetByJar`.
    if (isRebalanceCategory(t.categoryId)) continue;
    if (EXPENSE_TYPES.has(t.type)) {
      byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
    } else if (t.type === "refund") {
      byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) - t.amount);
    }
  }
  return byCat;
}

/**
 * `fixedCategoryIds` is the persona's stored set of categories flagged `fixed`
 * (recurring, non-negotiable). REQUIRED, with no bundled default: "fixed" is a
 * per-category user setting now, so a custom category the user marked fixed must
 * count as fixed, and the bundled seed cannot know about it. It splits `expense`
 * only — `income`, `expense` and `net` are identical whatever is passed, so a
 * wrong set can never move a headline total, only the fixed/discretionary cut
 * (which feeds `projection`'s run-rate).
 */
export function aggregateCashflow(
  txns: Transaction[],
  period: Period,
  fixedCategoryIds: ReadonlySet<string>,
): CashflowResult {
  let income = 0;
  let pendingExpense = 0;
  let latest: string | null = null;
  const sources: Transaction["source"][] = [];

  for (const t of txns) {
    if (!inPeriod(t, period) || t.status === "reversed") continue;

    if (t.status === "pending") {
      if (EXPENSE_TYPES.has(t.type)) pendingExpense += t.amount;
      continue;
    }
    if (t.status !== "posted") continue;

    sources.push(t.source);
    if (!latest || t.postedAt > latest) latest = t.postedAt;
    if (t.type === "income") income += t.amount;
  }

  const byCatMap = netExpenseByCategory(txns, period);
  let expense = 0;
  let fixed = 0;
  const byCategory: CategoryAmount[] = [];
  for (const [categoryId, amount] of byCatMap) {
    expense += amount;
    if (fixedCategoryIds.has(categoryId)) fixed += amount;
    byCategory.push({ categoryId, amount });
  }
  byCategory.sort((a, b) => b.amount - a.amount);

  const meta: AggregateMeta = {
    period,
    sourceCoverage: coverageOf(sources, sources.length, 0),
    freshness: latest,
  };

  return {
    income,
    expense,
    net: income - expense,
    byCategory,
    fixed,
    discretionary: expense - fixed,
    pendingExpense,
    meta,
  };
}
