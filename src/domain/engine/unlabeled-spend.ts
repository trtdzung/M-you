/**
 * "Chưa gắn nhãn" (unlabeled spend) — current-month money that left CASA without
 * a spending category and so has not landed in any hũ yet. Two kinds qualify:
 *  1. **Unclassified expenses** — `type === "expense"` still carrying the
 *     `UNCLASSIFIED` sentinel (spent straight from CASA, never categorised).
 *  2. **App-made transfers awaiting a category** — a transfer the user recorded
 *     through the app (`source === "self_reported"`, outgoing) that still reads
 *     as the structural "Chuyển khoản" category. The transfer-success card lets
 *     the user tag such a transfer as a real spend; this queue is the second
 *     entry point for the ones they skipped there.
 *
 * This is the SINGLE selector behind both the overview card's count/amount AND
 * the labeling sheet's list, so the two can never diverge (parity by
 * construction — the card is `count`, the sheet is `items`, same inputs).
 *
 * Truth rules (do not regress):
 *  - **posted-only** (`status === "posted"`): reversed + pending are excluded
 *    from spend truth (invariant #6).
 *  - **in-period**: the caller passes all-time transactions (the engine
 *    period-filters internally), so this selector applies `inPeriod` itself.
 *  - **invariant #6 preserved**: a queued transfer is NOT counted as spend by
 *    the cashflow/jar engines — it stays `type === "transfer"` (excluded) until
 *    the user assigns it a spending category, which flips it transfer→expense.
 *    Surfacing it here is a data-quality prompt only; it never becomes an
 *    expense number until that explicit user choice.
 *  - **bank history stays out**: only `self_reported` transfers qualify, so the
 *    persona's mock internal-savings / P2P-history transfers (all `source: mock`,
 *    also `categoryId: "transfer"`) never flood the queue.
 *
 * This is a DIFFERENT metric from the Transactions-tab `unclassifiedCount`
 * (which is all-month and includes hidden rows) — do not conflate them.
 */

import type { Transaction } from "@/domain/models";
import { CATEGORY } from "@/domain/models";
import { isUnclassified } from "@/domain/categorize/unclassified";
import { inPeriod } from "./cashflow";
import type { Period } from "./types";

/**
 * True for an app-made (self-reported) outgoing transfer that still carries the
 * structural "Chuyển khoản" category — i.e. the user has not yet decided it was a
 * real spend. Mirrors `TransferCategorizeSection`'s "unclassified transfer" rule
 * (`categoryId === CATEGORY.transfer`) so the queue and the success card agree on
 * what still needs a label.
 */
function isUnlabeledTransfer(txn: Transaction): boolean {
  return (
    txn.type === "transfer" &&
    txn.source === "self_reported" &&
    txn.direction === "debit" &&
    txn.categoryId === CATEGORY.transfer
  );
}

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
 * Select the current-month unlabeled spend from an all-time transaction list.
 * Single pass: `inPeriod && status === "posted" && (isUnclassified ||
 * isUnlabeledTransfer)`.
 */
export function selectUnlabeledSpend(txns: Transaction[], period: Period): UnlabeledSpendSelection {
  const items: Transaction[] = [];
  let amount = 0;
  for (const t of txns) {
    if (!inPeriod(t, period)) continue;
    if (t.status !== "posted") continue;
    if (!isUnclassified(t) && !isUnlabeledTransfer(t)) continue;
    items.push(t);
    amount += t.amount;
  }
  return { count: items.length, amount, items, source: "mock" };
}
