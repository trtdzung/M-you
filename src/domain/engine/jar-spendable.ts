/**
 * The single DERIVED "jar spendable balance" — the one number every screen keys
 * off (the transfer source picker, the unallocated pool, the funding/top-up
 * decision tree). It replaces the stored `Jar.actualAmount` parallel ledger that
 * used to drift from the overview's `remaining` (invariant #1: the deterministic
 * engine is the sole truth; there is no second stored balance to diverge).
 *
 * `spendable = max(0, remaining)` when a jar HAS a limit; `null` when the limit
 * is unset (`remaining == null`) — a jar with no limit is non-fundable ("chưa có
 * số dư"), never a fabricated 0 (invariant #6). A jar that has overspent
 * (`remaining < 0`) has 0 spendable, not a negative one.
 */

/** `remaining → spendable`: null stays null (non-fundable); negative floors at 0. */
export function jarSpendable(remaining: number | null): number | null {
  return remaining == null ? null : Math.max(0, remaining);
}

/**
 * The DERIVED "cần bù thủ công" condition (RT-fix C5): a jar with a set limit whose
 * `remaining < 0` is over-budget with no covering rebalance — the residual
 * over-allocated state that could not be auto-funded. Kept derived (never a stored flag) so it can't drift and re-surfaces
 * until the user funds it or accepts the over-allocation. `null` (unset limit) is
 * NOT a shortfall — an unlimited jar can't overspend a limit it doesn't have.
 */
export function jarNeedsManualTopUp(remaining: number | null): boolean {
  return remaining != null && remaining < 0;
}

/**
 * A jar reduced to exactly what the pool + funding need: its identity, its
 * categories (to charge a top-up), and its derived `spendable`. Built once from a
 * `JarBudgetLine` (`huId`,`label`,`categoryIds`,`remaining`) so the picker and the
 * overview can never disagree.
 */
export interface JarSpendable {
  id: string;
  label: string;
  categoryIds: string[];
  /** `max(0, remaining)`, or `null` when the jar has no limit (non-fundable). */
  spendable: number | null;
}
