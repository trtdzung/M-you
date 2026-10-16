/**
 * The virtual "Chưa phân bổ" (unallocated) pool — the CASA money that no jar's
 * real spendable balance (`actualAmount`) currently claims:
 *
 *   amount = casaBalance − Σ (jar.actualAmount ?? 0)
 *
 * It answers "chuyển không chọn hũ → trừ ở đâu?": the pool is the visible,
 * default source for a no-jar transfer, and it self-shrinks because it is a
 * DERIVED number — never a stored field (no new column, no drift, invariant #1).
 *
 * Invariant #6 (missing stays unknown, never a silent 0):
 *  - A jar with no `actualAmount` yet contributes 0 (it has drawn nothing from
 *    the pool), NOT a fabricated balance.
 *  - When jars claim MORE than CASA holds, `amount` keeps its true negative value
 *    and `overAllocated` is set. The engine never clamps to 0 — the UI decides how
 *    to present "Vượt phân bổ" (available = 0), but the truth stays negative here.
 */

import type { Jar } from "@/domain/models";

export interface UnallocatedPool {
  /** casaBalance − Σ actualAmount. May be negative (see `overAllocated`). */
  amount: number;
  /** True when jars claim more spendable money than CASA holds (`amount < 0`). */
  overAllocated: boolean;
  /** Provenance — a derived mock aggregate (invariant #5). */
  source: "mock";
}

export function computeUnallocatedPool(input: {
  casaBalance: number;
  jars: Pick<Jar, "actualAmount">[];
}): UnallocatedPool {
  const claimed = input.jars.reduce((sum, jar) => sum + (jar.actualAmount ?? 0), 0);
  const amount = input.casaBalance - claimed;
  return { amount, overAllocated: amount < 0, source: "mock" };
}
