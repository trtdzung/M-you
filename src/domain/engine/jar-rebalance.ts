/**
 * Rebalance-as-Transaction fold (plan 260918-1120, Phase 03). An inter-jar
 * coverage move is ONE `Transaction` tagged `categoryId: REBALANCE_CATEGORY`
 * carrying `rebalance` meta. The engine reads that meta and reconciles each jar's
 * remaining:
 *
 *   remaining(jar) += Σ nhận (amount whose `toJarId` is this jar)
 *                   − Σ cho  (amount whose `fromJarId` is this jar)
 *
 * `spent` is UNCHANGED — the rebalance amount is excluded from spend/thu/chi
 * upstream (`netExpenseByCategory` skips `REBALANCE_CATEGORY`). This is the ONLY
 * place the `rebalance` meta becomes engine numbers (invariant #1: deterministic
 * engine is sole truth; the LLM never computes it).
 *
 * `"pool"` sentinel: an end pointing at the DERIVED "Chưa phân bổ" pool is NEVER
 * credited/debited here. The pool is the residual `casaBalance − Σ spendable`, so a
 * jar→pool move already lifts the pool through the donor's reduced spendable — the
 * C1 identity `pool + Σ spendable = CASA` stays tautological. Only real jar ids get
 * a net (do NOT reintroduce a `pool + Σ remaining` assumption anywhere).
 */

import type { Transaction } from "@/domain/models";
import { isRebalanceCategory } from "@/domain/models";
import { inPeriod } from "./cashflow";
import type { Period } from "./types";

/** True for a posted, in-period rebalance txn carrying its meta. */
function isActiveRebalance(t: Transaction, period: Period): boolean {
  return (
    isRebalanceCategory(t.categoryId) &&
    t.rebalance !== undefined &&
    t.status === "posted" &&
    inPeriod(t, period)
  );
}

/**
 * Net rebalance per REAL jar for `period` (`Σ nhận − Σ cho`). The `"pool"` end is
 * skipped (the pool is derived, never a bucket). Jars not touched by any rebalance
 * are absent from the map (callers treat a missing key as 0).
 */
export function rebalanceNetByJar(txns: Transaction[], period: Period): Map<string, number> {
  const net = new Map<string, number>();
  const bump = (jarId: string, delta: number) => {
    if (jarId === "pool") return; // derived residual — never a rebalance bucket
    net.set(jarId, (net.get(jarId) ?? 0) + delta);
  };
  for (const t of txns) {
    if (!isActiveRebalance(t, period)) continue;
    const meta = t.rebalance!;
    bump(meta.toJarId, t.amount); // nhận (+)
    bump(meta.fromJarId, -t.amount); // cho (−)
  }
  return net;
}

/**
 * The period's rebalance txns (posted, in-period, meta present) for display — the
 * jar-detail pseudo-lines (Phase 02) and the write-path/undo surfaces (Phase 04/05)
 * read this instead of re-scanning the txn array.
 */
export function rebalanceTxns(txns: Transaction[], period: Period): Transaction[] {
  return txns.filter((t) => isActiveRebalance(t, period));
}
