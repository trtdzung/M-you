/**
 * Funding decision tree (deterministic) — the sole source of the "hũ đích thiếu
 * tiền" numbers: which tier the transfer is in, how much is short, and the exact
 * donor chain (pool + jars) that covers the shortfall. The LLM never computes any
 * of this (invariant #1); Phase 03 only narrates the result.
 *
 * Three tiers:
 *  - `ok`         — the source (a jar's `spendable`, or the pool) already
 *                   holds `amount`. No popup.
 *  - `topup`      — the source is short BUT source + pool + other DONATABLE jars
 *                   can cover it. A donor chain is proposed (never auto-applied).
 *  - `insufficient` — even the reachable `coverable` ceiling (source + pool +
 *                   donatable jars) can't cover `amount`. Hard block.
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

import { FIXED_CATEGORY_IDS } from "@/domain/models";
import type { JarSpendable } from "./jar-spendable";

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
export function isJarFixed(jar: Pick<JarSpendable, "categoryIds">): boolean {
  return jar.categoryIds.length > 0 && jar.categoryIds.every((id) => FIXED_CATEGORY_IDS.has(id));
}

/** A jar's derived spendable balance (0 when its limit is unset — `spendable == null`). */
function jarAvailable(jar: JarSpendable): number {
  return jar.spendable ?? 0;
}

/**
 * A jar can only DONATE to a top-up when it has a real spendable balance
 * (`spendable != null`) AND at least one category — Phase 03 charges a donor by
 * writing a self-reported expense into its `categoryIds[0]`, so a category-less
 * jar (which can't be honestly charged) is excluded, and a jar with no limit
 * (non-fundable) is excluded too.
 */
function canDonate(jar: JarSpendable): boolean {
  return jar.spendable != null && jar.categoryIds.length > 0;
}

/**
 * Build the donor chain covering `shortfall` from candidate jars (already
 * excluding the source jar) plus an optional pool contribution. Priority:
 * pool → discretionary (largest first) → fixed (largest first). Stops as soon as
 * the shortfall is met. `includePool` is the pool's available balance (>= 0);
 * pass 0 to leave the pool out (e.g. a pool-source transfer, where the pool is
 * what's short).
 */
function buildDonorChain(shortfall: number, candidates: JarSpendable[], poolAvailable: number): DonorProposal[] {
  const donors: DonorProposal[] = [];
  let remaining = shortfall;

  const push = (jarId: string | "pool", label: string, available: number) => {
    if (remaining <= 0 || available <= 0) return;
    const take = Math.min(available, remaining);
    donors.push({ jarId, label, take });
    remaining -= take;
  };

  push(POOL_DONOR_ID, POOL_DONOR_LABEL, poolAvailable);

  // Only jars that can be honestly charged (a real spendable balance + a category
  // to book the top-up spend into) are eligible donors (Phase 03's spend model).
  const eligible = candidates.filter(canDonate);
  const byBalanceDesc = (a: JarSpendable, b: JarSpendable) => jarAvailable(b) - jarAvailable(a);
  const discretionary = eligible.filter((j) => !isJarFixed(j)).sort(byBalanceDesc);
  const fixed = eligible.filter((j) => isJarFixed(j)).sort(byBalanceDesc);
  for (const jar of [...discretionary, ...fixed]) push(jar.id, `Hũ ${jar.label}`, jarAvailable(jar));

  return donors;
}

/** Σ spendable of the jars that can actually DONATE (real balance + a category). */
function donatableTotal(candidates: JarSpendable[]): number {
  return candidates.filter(canDonate).reduce((sum, j) => sum + jarAvailable(j), 0);
}

/**
 * Classify a transfer against what can ACTUALLY cover it, then (for a shortfall)
 * propose the donor chain. The `topup` vs `insufficient` boundary is a ceiling
 * bounded by TWO limits, whichever is tighter:
 *   1. `casaBalance` — the real cash in the account; nothing can be transferred
 *      beyond it (this bites when jars are over-allocated / drifted: their claimed
 *      spendable can exceed the CASA that actually backs it — the RT#2 case the
 *      confirm re-check exists to catch).
 *   2. `coverable = sourceAvailable + poolAvailable + Σ spendable(donatable OTHER
 *      jars)` — the money genuinely REACHABLE. This deliberately EXCLUDES a
 *      non-donatable jar's spendable (a category-less-but-limited jar, or one with
 *      no limit): that money is claimed away from the pool yet can never be donated
 *      (`buildDonorChain` only draws `canDonate` jars), so counting it would let the
 *      engine report `topup` with a chain that under-covers the shortfall (Warning 2).
 * `ceiling = min(casaBalance, coverable)`; `amount > ceiling` ⇒ `insufficient`.
 */
export function evaluateFunding(input: {
  amount: number;
  /** Source jar id, or `null` when the source is the pool (no-jar transfer). */
  sourceJarId: string | null;
  casaBalance: number;
  jars: JarSpendable[];
}): FundingAssessment {
  const { amount, sourceJarId, casaBalance, jars } = input;
  const base = { source: "mock" as const };

  const claimed = jars.reduce((sum, j) => sum + jarAvailable(j), 0);
  const poolAvailable = Math.max(0, casaBalance - claimed);

  if (sourceJarId === null) {
    // Pool source (RT#8): the pool IS the source; donatable jars are pulled down to
    // lift it. Coverable = pool + every donatable jar (no separate source jar).
    const ceiling = Math.min(casaBalance, poolAvailable + donatableTotal(jars));
    if (amount > ceiling) {
      return { tier: "insufficient", shortfall: amount - ceiling, donors: [], targetJarId: null, ...base };
    }
    if (amount <= poolAvailable) return { tier: "ok", shortfall: 0, donors: [], targetJarId: null, ...base };
    const shortfall = amount - poolAvailable;
    const donors = buildDonorChain(shortfall, jars, 0);
    return { tier: "topup", shortfall, donors, targetJarId: null, ...base };
  }

  const sourceJar = jars.find((j) => j.id === sourceJarId);
  const sourceAvailable = sourceJar ? jarAvailable(sourceJar) : 0;
  const candidates = jars.filter((j) => j.id !== sourceJarId);
  const ceiling = Math.min(casaBalance, sourceAvailable + poolAvailable + donatableTotal(candidates));
  if (amount > ceiling) {
    return { tier: "insufficient", shortfall: amount - ceiling, donors: [], targetJarId: sourceJarId, ...base };
  }
  if (amount <= sourceAvailable) {
    return { tier: "ok", shortfall: 0, donors: [], targetJarId: sourceJarId, ...base };
  }

  const shortfall = amount - sourceAvailable;
  const donors = buildDonorChain(shortfall, candidates, poolAvailable);
  return { tier: "topup", shortfall, donors, targetJarId: sourceJarId, ...base };
}
