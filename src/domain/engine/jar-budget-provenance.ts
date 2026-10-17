/**
 * Per-category provenance for jar-budget lines (split out of `jar-budget.ts` to
 * keep it focused). Mirrors the cashflow rule (posted expense/fee/refund only).
 */

import type { DataSource, Transaction } from "@/domain/models";
import { inPeriod } from "./cashflow";
import type { Period } from "./types";

const EXPENSE_TYPES: ReadonlySet<Transaction["type"]> = new Set(["expense", "fee", "refund"]);

/**
 * Per-category provenance (source + freshness) for posted spend in `period`,
 * mirroring the cashflow rule (posted expense/fee/refund only). Kept separate
 * from `netExpenseByCategory` (which returns amounts) so the amount path stays the
 * single canonical rule while lines still carry provenance (invariant #5).
 */
export function provenanceByCategory(
  txns: Transaction[],
  period: Period,
): Map<string, { sources: DataSource[]; latest: string | null }> {
  const map = new Map<string, { sources: DataSource[]; latest: string | null }>();
  for (const t of txns) {
    if (t.status !== "posted" || !inPeriod(t, period)) continue;
    if (!EXPENSE_TYPES.has(t.type)) continue;
    const entry = map.get(t.categoryId) ?? { sources: [], latest: null };
    entry.sources.push(t.source);
    if (!entry.latest || Date.parse(t.postedAt) > Date.parse(entry.latest)) entry.latest = t.postedAt;
    map.set(t.categoryId, entry);
  }
  return map;
}
