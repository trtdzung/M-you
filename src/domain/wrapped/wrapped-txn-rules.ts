/**
 * Per-transaction rules shared by every Wrapped fact builder. All spend math goes
 * through the engine's `signedExpenseContribution` — one counted-expense rule, so
 * Wrapped can never drift from Tổng quan.
 */

import { signedExpenseContribution } from "@/domain/engine/cashflow";
import { monthPeriodFromKey, VN_UTC_OFFSET_MS, type Period } from "@/domain/engine/types";
import type { Transaction } from "@/domain/models";

/** A transaction the engine counts as spend in the window, with its signed amount. */
export interface CountedRow {
  txn: Transaction;
  /** `+amount` for expense/fee, `−amount` for a refund. */
  contribution: number;
}

/**
 * A row tied to a PERSON, not a merchant: an external P2P counterparty, or a
 * confirmed transfer (typed `expense` with the recipient's name as merchant).
 * Such rows still count as real spend but never feed merchant/recurring/text facts.
 */
export function isPersonCounterparty(t: Transaction): boolean {
  return t.counterpartyAccountNumber !== undefined || t.createdVia === "transfer_confirm";
}

/** Discretionary = category NOT flagged fixed in the stored taxonomy (invariant #7). */
export function isDiscretionary(t: Transaction, fixedCategoryIds: ReadonlySet<string>): boolean {
  return !fixedCategoryIds.has(t.categoryId);
}

/** VN-calendar weekday of an instant (0 = Sunday .. 6 = Saturday); null when unparseable. */
export function vnWeekday(iso: string): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + VN_UTC_OFFSET_MS).getUTCDay();
}

/** Every counted row in `period`, in input order. */
export function countedRows(txns: Transaction[], period: Period): CountedRow[] {
  const rows: CountedRow[] = [];
  for (const txn of txns) {
    const contribution = signedExpenseContribution(txn, period);
    if (contribution !== null) rows.push({ txn, contribution });
  }
  return rows;
}

/**
 * True when the month holds at least one counted EXPENSE row (positive contribution
 * — the same rows `WrappedCoverage.countedExpenseCount` counts). NOT the same as
 * "has any posted row": income / transfers / card payments do not make a month a
 * spending month, and neither does a lone refund (it would show a negative month
 * of spend). A month failing this is `"unknown"`, never 0.
 */
export function monthHasExpenseData(txns: Transaction[], monthKey: string): boolean {
  const period = monthPeriodFromKey(monthKey);
  return txns.some((t) => (signedExpenseContribution(t, period) ?? 0) > 0);
}
