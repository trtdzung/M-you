/**
 * "Chưa gắn nhãn" (unlabeled spend) — current-month expenses spent straight from
 * CASA that never got a category (still carry the `UNCLASSIFIED` sentinel).
 *
 * This is the SINGLE selector behind both the overview card's count/amount AND
 * the labeling sheet's list, so the two can never diverge (parity by
 * construction — the card is `count`, the sheet is `items`, same inputs).
 *
 * Truth rules (do not regress):
 *  - **posted-only** (`status === "posted"`): reversed + pending are excluded
 *    from spend truth (invariant #6). `isUnclassified` alone does NOT check
 *    status, so the filter is added here.
 *  - **in-period**: the caller passes all-time transactions (the engine
 *    period-filters internally), so this selector applies `inPeriod` itself.
 *  - `isUnclassified` restricts to `type === "expense"` carrying `UNCLASSIFIED`.
 *
 * This is a DIFFERENT metric from the Transactions-tab `unclassifiedCount`
 * (which is all-month and includes hidden rows) — do not conflate them.
 */

import type { Transaction } from "@/domain/models";
import { isUnclassified } from "@/domain/categorize/unclassified";
import { inPeriod } from "./cashflow";
import type { Period } from "./types";

/** Summary of unlabeled spend for one month — lean (no `items`; the sheet re-runs the selector). */
export interface UnlabeledSpend {
  /** Number of posted, in-period, unlabeled expense transactions. */
  count: number;
  /** Σ of their positive VND magnitudes. */
  amount: number;
  /** Provenance — a derived mock aggregate (invariant #5). */
  source: "mock";
}

/** The full selection: `UnlabeledSpend` fields plus the underlying `items`. */
export interface UnlabeledSpendSelection extends UnlabeledSpend {
  /** The transactions counted — posted, in `period`, and unclassified. */
  items: Transaction[];
}

/**
 * Select the current-month unlabeled expenses from an all-time transaction list.
 * Single pass: `inPeriod && status === "posted" && isUnclassified`.
 */
export function selectUnlabeledSpend(txns: Transaction[], period: Period): UnlabeledSpendSelection {
  const items: Transaction[] = [];
  let amount = 0;
  for (const t of txns) {
    if (!inPeriod(t, period)) continue;
    if (t.status !== "posted") continue;
    if (!isUnclassified(t)) continue;
    items.push(t);
    amount += t.amount;
  }
  return { count: items.length, amount, items, source: "mock" };
}
