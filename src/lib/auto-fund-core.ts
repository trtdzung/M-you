/**
 * Pure auto-fund core (plan 260918-1120, Phases 04/05). The deterministic half of
 * the shared `useAutoFund` unit — no React, no I/O — so Case 1 (jar-sourced
 * transfer confirm) and Case 2 (spend-first, categorize-later) share ONE funding +
 * rebalance mechanic (DRY). It:
 *   1. builds a jar spendable/CASA snapshot for a GIVEN date (RT-fix H4: the
 *      trigger txn's period, never the viewed month),
 *   2. turns an `evaluateFunding` donor chain into `dieu-chinh-hu` rebalance
 *      txn inputs (invariant #1: donors + amounts come from the engine),
 *   3. exposes the overspend of a jar for the Case-2 / reconcile framing.
 *
 * The engine is the sole source of truth (invariant #1); the LLM never reaches
 * here. Rebalances are virtual (no OTP — invariant #3 covers real money only) and
 * excluded from thu/chi (invariant #6).
 */

import type { Account, JarConfig, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY, REBALANCE_CATEGORY_LABEL } from "@/domain/models";
import {
  addMonthsToKey,
  balanceAsOf,
  casaBalance,
  categoryToJarMap,
  dateToMonthKey,
  evaluateJarBudget,
  jarBalances,
  jarSpendable,
  monthPeriodFromKey,
  POOL_DONOR_ID,
  rebalanceNetByJar,
  type DonorProposal,
  type JarBudgetLine,
  type JarSpendable,
  type Period,
} from "@/domain/engine";
import type { ManualTxnInput } from "@/state/manual-txns";

/** Everything the snapshot needs — the freshest merged txn view + accounts + config. */
export interface AutoFundDeps {
  /** Correction-applied provider + manual txns (period-INDEPENDENT; scoped inside). */
  transactions: Transaction[];
  accounts: Account[];
  jarConfig: JarConfig;
  now: Date;
}

/** A jar spendable/CASA snapshot pinned to one period (the trigger date's month). */
export interface JarSnapshot {
  month: string;
  spendables: JarSpendable[];
  lines: JarBudgetLine[];
  casaBalance: number;
}

/**
 * Build the funding snapshot for `postedAt`'s month (H4). `overrides` splices a
 * just-applied-but-not-yet-rerendered mutation (a status/amount/category patch) and
 * `excludeIds` drops rebalances already removed this tick — so a reconcile computes
 * against the POST-mutation state synchronously, independent of React batching.
 */
export function snapshotForDate(
  deps: AutoFundDeps,
  postedAt: string,
  opts: { excludeIds?: ReadonlySet<string>; overrides?: Map<string, Partial<Transaction>> } = {},
): JarSnapshot {
  // J06: an unparseable `postedAt` falls back to the injected clock's month (VN
  // time) instead of throwing — never a crash in the funding path.
  const month = dateToMonthKey(new Date(postedAt), deps.now);
  const period = monthPeriodFromKey(month);
  const prev = monthPeriodFromKey(addMonthsToKey(month, -1));
  const txns = deps.transactions
    .filter((t) => !opts.excludeIds?.has(t.id))
    .map((t) => {
      const patch = opts.overrides?.get(t.id);
      return patch ? { ...t, ...patch } : t;
    });
  const net = rebalanceNetByJar(txns, period);
  // Running balance as of the trigger instant (`postedAt`, stamped by callers with
  // `transferNow()` — the SAME clock that stamps ledger rows, Red Team #1): ledger
  // rows written after the trigger are not yet in the jar. Posted txns fold to the
  // trigger month's end — the same window as the display path and `spent`, so the
  // snapshot never disagrees with the balance the user sees (see `jarBalances`).
  // Carries across months: an October trigger sees September's leftover balance.
  const balances = jarBalances(deps.jarConfig, txns, balanceAsOfTrigger(postedAt, period, deps.now), period.to);
  const { lines } = evaluateJarBudget(deps.jarConfig, txns, period, prev, deps.now, net, balances);
  const spendables = lines.map((l) => ({
    id: l.huId,
    label: l.label,
    categoryIds: l.categoryIds,
    spendable: jarSpendable(l.balance),
  }));
  return { month, spendables, lines, casaBalance: casaBalance(deps.accounts) };
}

/** `postedAt` as the balance `asOf`; an unparseable one falls back to `min(period.to, now)` (J06). */
function balanceAsOfTrigger(postedAt: string, period: Period, now: Date): string {
  const ms = Date.parse(postedAt);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : balanceAsOf(period, now);
}

/** The jar a category currently routes into (null when unmapped — transfer/rebalance). */
export function jarIdForCategory(jarConfig: JarConfig, categoryId: string): string | null {
  return categoryToJarMap(jarConfig).get(categoryId) ?? null;
}

/**
 * The jar's shortfall on the BALANCE axis (`balance < 0` → hết số dư), 0 when the
 * balance is non-negative or unknown (`null` — never a fabricated shortfall, #6).
 * Being over the monthly LIMIT (`spent > limit`) alone never triggers a cover.
 */
export function overspendOf(lines: JarBudgetLine[], jarId: string): number {
  const line = lines.find((l) => l.huId === jarId);
  if (!line || line.balance == null) return 0;
  return line.balance < 0 ? -line.balance : 0;
}

/**
 * Turn a non-goal (or explicitly-confirmed goal) donor chain into `dieu-chinh-hu`
 * rebalance txn inputs — one per donor, INCLUDING the pool donor (S2/G01): a pool
 * cover writes a `fromJarId: "pool"` → target leg so the target jar is credited
 * (`rebalanceNetByJar` skips the pool end, so the pool itself is never debited
 * twice — the C1 identity `pool + Σ spendable = CASA` stays tautological). Only a
 * pool → pool leg (pool donor for a pool-source lift) is dropped as meaningless.
 * `toJarId` is the target jar, or the `"pool"` sentinel for a pool-source lift.
 */
export function rebalanceInputsFor(
  donors: DonorProposal[],
  targetJarId: string | null,
  triggerTxnId: string,
  postedAt: string,
  origin: "auto" | "manual",
): ManualTxnInput[] {
  const toJarId = targetJarId ?? POOL_DONOR_ID;
  return donors
    .filter((d) => Number.isFinite(d.take) && d.take > 0)
    .filter((d) => !(d.jarId === POOL_DONOR_ID && toJarId === POOL_DONOR_ID))
    .map((d) => ({
      amount: d.take,
      direction: "debit" as const,
      type: "transfer" as const, // excluded from thu/chi; REBALANCE_CATEGORY isn't in the taxonomy
      categoryId: REBALANCE_CATEGORY,
      merchantName: REBALANCE_CATEGORY_LABEL,
      postedAt,
      rebalance: {
        fromJarId: d.jarId,
        toJarId,
        triggerTxnId,
        origin,
      },
    }));
}
