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
  casaBalance,
  categoryToJarMap,
  dateToMonthKey,
  evaluateJarBudget,
  jarSpendable,
  monthPeriodFromKey,
  POOL_DONOR_ID,
  rebalanceNetByJar,
  type DonorProposal,
  type JarBudgetLine,
  type JarSpendable,
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
  const month = dateToMonthKey(new Date(postedAt));
  const period = monthPeriodFromKey(month);
  const prev = monthPeriodFromKey(addMonthsToKey(month, -1));
  const txns = deps.transactions
    .filter((t) => !opts.excludeIds?.has(t.id))
    .map((t) => {
      const patch = opts.overrides?.get(t.id);
      return patch ? { ...t, ...patch } : t;
    });
  const net = rebalanceNetByJar(txns, period);
  const { lines } = evaluateJarBudget(deps.jarConfig, txns, period, prev, deps.now, net);
  const spendables = lines.map((l) => ({
    id: l.huId,
    label: l.label,
    categoryIds: l.categoryIds,
    role: l.role,
    spendable: jarSpendable(l.remaining),
  }));
  return { month, spendables, lines, casaBalance: casaBalance(deps.accounts) };
}

/** The jar a category currently routes into (null when unmapped — transfer/rebalance). */
export function jarIdForCategory(jarConfig: JarConfig, categoryId: string): string | null {
  return categoryToJarMap(jarConfig).get(categoryId) ?? null;
}

/** How far a jar is over its limit in the snapshot (0 when within budget / unset). */
export function overspendOf(lines: JarBudgetLine[], jarId: string): number {
  const line = lines.find((l) => l.huId === jarId);
  if (!line || line.remaining == null) return 0;
  return line.remaining < 0 ? -line.remaining : 0;
}

/**
 * Turn a non-goal (or explicitly-confirmed goal) donor chain into `dieu-chinh-hu`
 * rebalance txn inputs — one per JAR donor. The pool donor produces NO record (the
 * derived pool self-shrinks via the account debit / the jar's reduced spendable —
 * the C1 identity `pool + Σ spendable = CASA` stays tautological). `toJarId` is the
 * target jar, or the `"pool"` sentinel for a pool-source lift.
 */
export function rebalanceInputsFor(
  donors: DonorProposal[],
  targetJarId: string | null,
  triggerTxnId: string,
  postedAt: string,
  origin: "auto" | "manual",
): ManualTxnInput[] {
  return donors
    .filter((d) => d.jarId !== POOL_DONOR_ID && d.take > 0)
    .map((d) => ({
      amount: d.take,
      direction: "debit" as const,
      type: "transfer" as const, // excluded from thu/chi; REBALANCE_CATEGORY isn't in the taxonomy
      categoryId: REBALANCE_CATEGORY,
      merchantName: REBALANCE_CATEGORY_LABEL,
      postedAt,
      rebalance: {
        fromJarId: d.jarId,
        toJarId: targetJarId ?? POOL_DONOR_ID,
        triggerTxnId,
        origin,
      },
    }));
}
