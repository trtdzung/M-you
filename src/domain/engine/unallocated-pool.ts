/**
 * The virtual "Chưa phân bổ" (unallocated) pool — the CASA money that no jar's
 * DERIVED spendable balance currently claims:
 *
 *   amount = casaBalance − Σ spendable(jar)
 *
 * where `spendable(jar) = max(0, balance)` (see `jar-spendable.ts`) — the SAME
 * number the overview and the transfer picker show. This is the ONE definition of
 * "unallocated": the overview "Chờ phân bổ" (`evaluateJarEnvelope.pending`) and the
 * picker "Chưa phân bổ" both come from here (D26/S12). It answers "chuyển không
 * chọn hũ → trừ ở đâu?" and self-shrinks because it is DERIVED — never stored.
 *
 * Invariant #6 (missing stays unknown, never a silent 0):
 *  - No CASA (`current`) account → `casaBalance: "unknown"` → `amount: "unknown"`,
 *    `overAllocated: false` — never a fabricated 0 that turns negative (D27).
 *  - A jar with no balance (`null` — no ledger row yet, or a month before its
 *    anchor) contributes 0 to the pool total (`spendable == null` → it claims
 *    nothing), NOT a fabricated balance.
 *  - When jars claim MORE than CASA holds, `amount` keeps its true negative value
 *    and `overAllocated` is set. The engine never clamps to 0 — the UI decides how
 *    to present "Vượt phân bổ" (available = 0), but the truth stays negative here.
 */

import { UNKNOWN, type Amount } from "./types";

/** A pool computed from a KNOWN CASA balance. */
export interface UnallocatedPool {
  /** casaBalance − Σ spendable. May be negative (see `overAllocated`). */
  amount: number;
  /** True when jars claim more spendable money than CASA holds (`amount < 0`). */
  overAllocated: boolean;
  /** Provenance — a derived mock aggregate (invariant #5). */
  source: "mock";
}

/** The pool when CASA is unknown (no `current` account) — never a fabricated 0. */
export interface UnknownUnallocatedPool {
  amount: "unknown";
  overAllocated: false;
  source: "mock";
}

/** Either a known pool or the "unknown" sentinel pool. */
export type UnallocatedPoolResult = UnallocatedPool | UnknownUnallocatedPool;

export function computeUnallocatedPool(input: { casaBalance: number; spendableTotal: number }): UnallocatedPool;
export function computeUnallocatedPool(input: { casaBalance: Amount; spendableTotal: number }): UnallocatedPoolResult;
export function computeUnallocatedPool(input: {
  /** Σ availableBalance of `current` accounts, or "unknown" when there is none. */
  casaBalance: Amount;
  /** Σ of every jar's derived `spendable` (a null-spendable jar contributes 0). */
  spendableTotal: number;
}): UnallocatedPoolResult {
  if (input.casaBalance === UNKNOWN) return { amount: UNKNOWN, overAllocated: false, source: "mock" };
  const amount = input.casaBalance - input.spendableTotal;
  return { amount, overAllocated: amount < 0, source: "mock" };
}
