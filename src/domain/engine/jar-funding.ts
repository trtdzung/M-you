/**
 * Funding decision tree (deterministic) — the sole source of the "hũ đích thiếu
 * tiền" numbers: which tier the transfer is in, how much is short, and the exact
 * donor chain (pool + jars) that covers the shortfall. The LLM never computes any
 * of this (invariant #1); Phase 03 only narrates the result.
 *
 * Three tiers:
 *  - `ok`         — the source (a jar's `actualAmount`, or the pool) already
 *                   holds `amount`. No popup.
 *  - `topup`      — the source is short BUT source + pool + other jars can cover
 *                   it. A donor chain is proposed (reviewed, never auto-applied).
 *  - `insufficient` — even the whole CASA can't cover `amount`. Hard block.
 *
 * Donor priority (cover the shortfall, cheapest-social-cost first):
 *   (1) the pool ("Chưa phân bổ") → (2) discretionary jars, largest balance
 *   first → (3) fixed ("thiết yếu") jars, last resort. Each donor takes
 *   `min(available, còn thiếu)`; the chain stops the moment the shortfall is met.
 *
 * Pool direction (RT#8): `sourceJarId === null` means the POOL is the source (a
 * no-jar transfer). The shortfall is `amount − poolAvailable`; donors are jars
 * whose balance is pulled DOWN to lift the pool (no target jar). `confirm()`
 * applies the same one-batch mechanic — only donor decrements, no target credit.
 */

import type { Jar } from "@/domain/models";
import { FIXED_CATEGORY_IDS } from "@/domain/models";

export type FundingTier = "ok" | "topup" | "insufficient";

export interface DonorProposal {
  /** A real jar id, or the sentinel "pool" for the derived unallocated pool. */
  jarId: string | "pool";
  label: string;
  /** VND this donor contributes toward the shortfall (min of its balance and còn thiếu). */
  take: number;
}

export interface FundingAssessment {
  tier: FundingTier;
  /** VND the source is short by (0 when `ok`). */
  shortfall: number;
  /** Donor chain covering `shortfall`, in priority order (empty when ok/insufficient). */
  donors: DonorProposal[];
  /** The jar the shortfall funds (the transfer source jar); `null` for a pool transfer. */
  targetJarId: string | null;
  source: "mock";
}

export const POOL_DONOR_ID = "pool" as const;
export const POOL_DONOR_LABEL = "Chưa phân bổ";

/**
 * A jar is "thiết yếu" (protected from donation until last) only when EVERY
 * category it holds is fixed — a mixed jar is treated as discretionary so it can
 * still be tapped (RT#5: `Jar` has no `fixed` field; it is DERIVED from
 * `categoryIds`). A jar with no categories is not protected (nothing marks it
 * essential).
 */
export function isJarFixed(jar: Pick<Jar, "categoryIds">): boolean {
  return jar.categoryIds.length > 0 && jar.categoryIds.every((id) => FIXED_CATEGORY_IDS.has(id));
}

/** A jar's spendable balance (0 when it has no `actualAmount` yet). */
function jarAvailable(jar: Jar): number {
  return jar.actualAmount ?? 0;
}

/**
 * Build the donor chain covering `shortfall` from candidate jars (already
 * excluding the source jar) plus an optional pool contribution. Priority:
 * pool → discretionary (largest first) → fixed (largest first). Stops as soon as
 * the shortfall is met. `includePool` is the pool's available balance (>= 0);
 * pass 0 to leave the pool out (e.g. a pool-source transfer, where the pool is
 * what's short).
 */
function buildDonorChain(shortfall: number, candidates: Jar[], poolAvailable: number): DonorProposal[] {
  const donors: DonorProposal[] = [];
  let remaining = shortfall;

  const push = (jarId: string | "pool", label: string, available: number) => {
    if (remaining <= 0 || available <= 0) return;
    const take = Math.min(available, remaining);
    donors.push({ jarId, label, take });
    remaining -= take;
  };

  push(POOL_DONOR_ID, POOL_DONOR_LABEL, poolAvailable);

  const byBalanceDesc = (a: Jar, b: Jar) => jarAvailable(b) - jarAvailable(a);
  const discretionary = candidates.filter((j) => !isJarFixed(j)).sort(byBalanceDesc);
  const fixed = candidates.filter((j) => isJarFixed(j)).sort(byBalanceDesc);
  for (const jar of [...discretionary, ...fixed]) push(jar.id, `Hũ ${jar.label}`, jarAvailable(jar));

  return donors;
}

/**
 * Total spendable money reachable to cover a transfer: CASA holds all of it, so
 * the ceiling for `topup` vs `insufficient` is simply `casaBalance` (jars are
 * labels over the same CASA money — draining every jar back into CASA can never
 * exceed it). Kept explicit so the boundary is obvious and testable.
 */
export function evaluateFunding(input: {
  amount: number;
  /** Source jar id, or `null` when the source is the pool (no-jar transfer). */
  sourceJarId: string | null;
  casaBalance: number;
  jars: Jar[];
}): FundingAssessment {
  const { amount, sourceJarId, casaBalance, jars } = input;
  const base = { source: "mock" as const };

  // Insufficient: not even the whole CASA covers it (invariant: jars ⊆ CASA).
  if (amount > casaBalance) {
    return { tier: "insufficient", shortfall: amount - casaBalance, donors: [], targetJarId: sourceJarId, ...base };
  }

  const claimed = jars.reduce((sum, j) => sum + jarAvailable(j), 0);
  const poolAvailable = Math.max(0, casaBalance - claimed);

  if (sourceJarId === null) {
    // Pool source (RT#8): shortfall when the pool can't cover it; donors are jars
    // pulled down to lift the pool. No target jar.
    if (amount <= poolAvailable) return { tier: "ok", shortfall: 0, donors: [], targetJarId: null, ...base };
    const shortfall = amount - poolAvailable;
    const donors = buildDonorChain(shortfall, jars, 0);
    return { tier: "topup", shortfall, donors, targetJarId: null, ...base };
  }

  const sourceJar = jars.find((j) => j.id === sourceJarId);
  const sourceAvailable = sourceJar ? jarAvailable(sourceJar) : 0;
  if (amount <= sourceAvailable) {
    return { tier: "ok", shortfall: 0, donors: [], targetJarId: sourceJarId, ...base };
  }

  const shortfall = amount - sourceAvailable;
  const candidates = jars.filter((j) => j.id !== sourceJarId);
  const donors = buildDonorChain(shortfall, candidates, poolAvailable);
  return { tier: "topup", shortfall, donors, targetJarId: sourceJarId, ...base };
}
