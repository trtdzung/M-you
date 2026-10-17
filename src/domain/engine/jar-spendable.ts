/**
 * The single DERIVED "jar spendable balance" — the one number every screen keys
 * off (the transfer source picker, the unallocated pool, the funding/top-up
 * decision tree). It replaces the stored `Jar.actualAmount` parallel ledger that
 * used to drift from the overview's balance (invariant #1: the deterministic
 * engine is the sole truth; the running balance is derived by `jarBalances`).
 *
 * `spendable = max(0, balance)` when a jar HAS a running balance; `null` when it
 * has none (`balance == null`: unfunded or pre-anchor) — non-fundable ("chưa có
 * số dư"), never a fabricated 0 (invariant #6). A jar that has overspent its
 * balance (`balance < 0`) has 0 spendable, not a negative one.
 */

/** `balance → spendable`: null stays null (non-fundable); negative floors at 0. */
export function jarSpendable(balance: number | null): number | null {
  return balance == null ? null : Math.max(0, balance);
}

/**
 * The DERIVED "cần bù thủ công" condition (RT-fix C5): a jar whose running
 * `balance < 0` has spent more than it holds, with no covering rebalance — the residual
 * over-allocated state that could not be auto-funded. Kept derived (never a stored flag) so it can't drift and re-surfaces
 * until the user funds it or accepts the over-allocation. `null` (no balance) is
 * NOT a shortfall — an unfunded jar has no balance to overdraw.
 */
export function jarNeedsManualTopUp(balance: number | null): boolean {
  return balance != null && balance < 0;
}

/**
 * A jar reduced to exactly what the pool + funding need: its identity, its
 * categories (to charge a top-up), and its derived `spendable`. Built once from a
 * `JarBudgetLine` (`huId`,`label`,`categoryIds`,`balance`) so the picker and the
 * overview can never disagree.
 */
export interface JarSpendable {
  id: string;
  label: string;
  categoryIds: string[];
  /** `max(0, balance)`, or `null` when the jar has no balance (non-fundable). */
  spendable: number | null;
}
