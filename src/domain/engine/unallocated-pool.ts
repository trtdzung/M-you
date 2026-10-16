/**
 * The virtual "Chưa phân bổ" (unallocated) pool — the CASA money that no jar's
 * DERIVED spendable balance currently claims:
 *
 *   amount = casaBalance − Σ spendable(jar)
 *
 * where `spendable(jar) = max(0, remaining)` (see `jar-spendable.ts`) — the SAME
 * number the overview and the transfer picker show. It answers "chuyển không
 * chọn hũ → trừ ở đâu?": the pool is the visible, default source for a no-jar
 * transfer, and it self-shrinks because it is a DERIVED number — never a stored
 * field (no column, no drift, invariant #1).
 *
 * Invariant #6 (missing stays unknown, never a silent 0):
 *  - A jar with no limit contributes 0 to the pool total (`spendable == null` →
 *    counted as 0 here — it claims nothing), NOT a fabricated balance.
 *  - When jars claim MORE than CASA holds, `amount` keeps its true negative value
 *    and `overAllocated` is set. The engine never clamps to 0 — the UI decides how
 *    to present "Vượt phân bổ" (available = 0), but the truth stays negative here.
 */

export interface UnallocatedPool {
  /** casaBalance − Σ spendable. May be negative (see `overAllocated`). */
  amount: number;
  /** True when jars claim more spendable money than CASA holds (`amount < 0`). */
  overAllocated: boolean;
  /** Provenance — a derived mock aggregate (invariant #5). */
  source: "mock";
}

export function computeUnallocatedPool(input: {
  casaBalance: number;
  /** Σ of every jar's derived `spendable` (a null-spendable jar contributes 0). */
  spendableTotal: number;
}): UnallocatedPool {
  const amount = input.casaBalance - input.spendableTotal;
  return { amount, overAllocated: amount < 0, source: "mock" };
}
