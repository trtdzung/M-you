/**
 * Funding decision tree (deterministic) — the sole source of the "hũ đích thiếu
 * tiền" numbers: which tier the transfer is in, how much is short, and the exact
 * donor chain (pool + jars) that covers the shortfall. The LLM never computes any
 * of this (invariant #1); Phase 03 only narrates the result.
 *
 * Three tiers:
 *  - `ok`           — the source (a jar's `spendable`, or the pool) already
 *                     holds `amount`. No popup.
 *  - `topup`        — the source is short BUT source + pool + DONATABLE jars can
 *                     cover it. A donor chain is proposed (never auto-applied).
 *  - `insufficient` — even the reachable ceiling can't cover `amount`.
 *
 * Donor priority: (1) the pool ("Chưa phân bổ"), then (2) the other jars, largest
 * `spendable` first. Each donor takes `min(available, còn thiếu)`; the chain stops
 * the moment the shortfall is met.
 *
 * Pool direction (RT#8): `sourceJarId === null` means the POOL is the source (a
 * no-jar transfer). The shortfall is `amount − poolAvailable`; donors are jars
 * whose balance is pulled DOWN to lift the pool (no target jar). `confirm()`
 * applies the same one-batch mechanic — only donor decrements, no target credit.
 */

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

/** A jar's derived spendable balance (0 when its limit is unset — `spendable == null`). */
function jarAvailable(jar: JarSpendable): number {
  const s = jar.spendable;
  return s != null && Number.isFinite(s) && s > 0 ? s : 0;
}

/**
 * A jar can DONATE to a top-up when it has a real spendable balance
 * (`spendable != null`). A donor is charged by a `dieu-chinh-hu` rebalance leg
 * (`fromJarId` → target), which needs no category — so a category-less jar with
 * money (e.g. "Tiết kiệm") donates like any other (S6/E11). A jar with
 * no limit (non-fundable, `spendable == null`) is still excluded.
 */
export function canDonate(jar: JarSpendable): boolean {
  return jar.spendable != null;
}

/** Donatable candidates, largest spendable first. */
function orderDonors(candidates: JarSpendable[]): JarSpendable[] {
  return candidates.filter(canDonate).sort((a, b) => jarAvailable(b) - jarAvailable(a));
}

/** Draw pool (if any) then the pre-ordered jars until `shortfall` is met. */
function chainFrom(shortfall: number, ordered: JarSpendable[], poolAvailable: number): DonorProposal[] {
  const donors: DonorProposal[] = [];
  let remaining = shortfall;
  const push = (jarId: string | "pool", label: string, available: number) => {
    if (remaining <= 0 || available <= 0) return;
    const take = Math.min(available, remaining);
    donors.push({ jarId, label, take });
    remaining -= take;
  };
  push(POOL_DONOR_ID, POOL_DONOR_LABEL, poolAvailable);
  for (const jar of ordered) push(jar.id, `Hũ ${jar.label}`, jarAvailable(jar));
  return donors;
}

/**
 * Build the donor chain covering `shortfall` (candidates already exclude the
 * source jar). `poolAvailable` is the pool's balance (>= 0); pass 0 to leave the
 * pool out (a pool-source transfer).
 */
function buildDonorChain(shortfall: number, candidates: JarSpendable[], poolAvailable: number): DonorProposal[] {
  return chainFrom(shortfall, orderDonors(candidates), poolAvailable);
}

/** Σ spendable of donatable jars. */
function donatableTotal(candidates: JarSpendable[]): number {
  return candidates.filter(canDonate).reduce((sum, j) => sum + jarAvailable(j), 0);
}

/**
 * Shared classifier for both a jar source and the pool source. `sourceAvailable`
 * is the money already at the source; `poolForDonors` is what the pool can add to
 * the DONOR chain (the pool balance for a jar source, 0 for a pool source, whose
 * balance is already `sourceAvailable`). `candidates` are the other jars.
 *
 * The `topup` vs `insufficient` boundary is a ceiling bounded by two limits,
 * whichever is tighter: `casaBalance` (real cash, bites when jars are
 * over-allocated / drifted — RT#2) and the reachable donatable money.
 */
function assess(input: {
  amount: number;
  casaBalance: number;
  sourceAvailable: number;
  poolForDonors: number;
  candidates: JarSpendable[];
  targetJarId: string | null;
}): FundingAssessment {
  const { amount, casaBalance, sourceAvailable, poolForDonors, candidates, targetJarId } = input;
  const base = { targetJarId, source: "mock" as const };
  const ceiling = Math.min(casaBalance, sourceAvailable + poolForDonors + donatableTotal(candidates));

  if (amount <= sourceAvailable) {
    return { tier: "ok", shortfall: 0, donors: [], ...base };
  }
  if (amount > ceiling) {
    // Even every donatable jar falls short (C1 over-allocated residual).
    return { tier: "insufficient", shortfall: amount - ceiling, donors: [], ...base };
  }
  const shortfall = amount - sourceAvailable;
  return { tier: "topup", shortfall, donors: buildDonorChain(shortfall, candidates, poolForDonors), ...base };
}

/**
 * Classify a transfer against what can ACTUALLY cover it, then propose the donor
 * chain. See `assess` for the ceiling logic; `evaluateFunding` just derives the
 * pool and maps a jar source vs a pool source onto it.
 */
export function evaluateFunding(input: {
  amount: number;
  /** Source jar id, or `null` when the source is the pool (no-jar transfer). */
  sourceJarId: string | null;
  casaBalance: number;
  jars: JarSpendable[];
}): FundingAssessment {
  const { amount, sourceJarId, casaBalance, jars } = input;

  // E01c/E01d: a non-finite amount can't be funded — graceful `insufficient` with
  // no NaN/Infinity leaking into `shortfall` or the donor chain. `amount ≤ 0` → ok.
  if (!Number.isFinite(amount)) {
    return { tier: "insufficient", shortfall: 0, donors: [], targetJarId: sourceJarId, source: "mock" };
  }
  if (amount <= 0) {
    return { tier: "ok", shortfall: 0, donors: [], targetJarId: sourceJarId, source: "mock" };
  }

  const claimed = jars.reduce((sum, j) => sum + jarAvailable(j), 0);
  const poolAvailable = Math.max(0, casaBalance - claimed);

  if (sourceJarId === null) {
    // Pool source (RT#8): the pool IS the source; donatable jars are pulled down to
    // lift it. `sourceAvailable` is the pool; no separate pool contribution to donors.
    return assess({ amount, casaBalance, sourceAvailable: poolAvailable, poolForDonors: 0, candidates: jars, targetJarId: null });
  }

  const sourceJar = jars.find((j) => j.id === sourceJarId);
  const sourceAvailable = sourceJar ? jarAvailable(sourceJar) : 0;
  const candidates = jars.filter((j) => j.id !== sourceJarId);
  return assess({ amount, casaBalance, sourceAvailable, poolForDonors: poolAvailable, candidates, targetJarId: sourceJarId });
}
