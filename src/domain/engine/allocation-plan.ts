/**
 * Pure "Chia ngay" planner (plan 260914-1436, Phase 04). Turns a per-jar target
 * ("tôi muốn bỏ X vào hũ này") into concrete txn-keyed allocation rows by
 * drawing from the period's unallocated income remainders in FIFO order.
 *
 * Kept in the engine layer (not the component) so the number logic is
 * deterministic and unit-tested (invariant #1 spirit). It NEVER over-draws a
 * txn's remaining capacity nor a jar's target, and it shares capacity across
 * jars in call order — so it agrees exactly with `computePendingAllocation`
 * (both read the same `perTxn` shape). No money movement (invariant #3).
 */

import type { PendingTxn } from "./jar-envelope";

export interface AllocationRow {
  txnId: string;
  jarId: string;
  amount: number;
}

/** Sanitise a requested VND target: non-finite / ≤ 0 → 0; else floored to whole VND. */
function cleanTarget(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Build allocation rows for `draftByJar` (jarId → desired VND) against the
 * unallocated income remainders in `perTxn`. Jars are filled in the object's key
 * order, each drawing FIFO from the remaining capacity left by earlier jars.
 * A target larger than the capacity still available is simply left short (the UI
 * caps Σ target ≤ pending; this is the deterministic backstop). Zero targets and
 * zero-capacity txns are skipped, so no empty rows are emitted.
 */
export function buildAllocationRows(
  perTxn: PendingTxn[],
  draftByJar: Record<string, number>,
): AllocationRow[] {
  const capacity = perTxn.map((p) => ({ txnId: p.txnId, left: Math.max(0, p.remaining) }));
  const rows: AllocationRow[] = [];

  for (const [jarId, rawTarget] of Object.entries(draftByJar)) {
    let target = cleanTarget(rawTarget);
    if (target === 0) continue;
    for (const cap of capacity) {
      if (target === 0) break;
      if (cap.left === 0) continue;
      const take = Math.min(cap.left, target);
      rows.push({ txnId: cap.txnId, jarId, amount: take });
      cap.left -= take;
      target -= take;
    }
  }
  return rows;
}
