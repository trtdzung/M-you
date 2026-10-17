/**
 * Jar running BALANCE (plan 260923-jar-limit-vs-balance-split) — the STOCK axis,
 * kept apart from the monthly LIMIT axis (`spent` this period vs `budgetLimit`).
 *
 *   balance(jar) = Σ deposit − Σ withdraw − Σ spent[anchor, txnsTo] + Σ rebalanceNet[anchor, txnsTo]
 *
 * `anchor = jar.createdAt ?? earliest ledger entry`; `asOf` is ONE injected instant
 * (callers pass `min(period.to, now)` with `now = transferNow()`, the same clock that
 * stamps ledger rows — so a just-written row is always ≤ asOf). Carries over months.
 *
 * Two cut-offs: ledger rows (and the pre-anchor check) use `asOf`; posted
 * transactions use `txnsTo` (callers pass the viewed `period.to`). A posting is bank
 * truth already reflected in CASA and in the period's `spent`, so a same-day posting
 * stamped later than the demo clock's time-of-day must still reduce the balance —
 * otherwise balance, `spent` and the pool identity would disagree.
 *
 * Invariants honoured:
 *  - Pure + deterministic: the engine is the only place a balance is computed (#1).
 *  - Spend reuses `netExpenseByCategory` + the first-owner rule (`ownedCategories`)
 *    of jar-budget, so refunds/reversed/pending/rebalance rules are identical (#6).
 *  - No ledger entry ≤ asOf, or asOf before the anchor → `balance: null` ("chưa có
 *    số dư"), never a fabricated 0 (#6). A 0 opening deposit IS a known 0.
 *  - Ledger rows are `self_reported`; a funded balance carries that provenance (#5).
 *  - The ledger is a display partition of CASA — no money moves here (#3).
 */

import type { DataSource, JarConfig, JarLedgerEntry, Transaction } from "@/domain/models";
import { netExpenseByCategory } from "./cashflow";
import { categoryToJarMap } from "./category-jars";
import { ownedCategories } from "./jar-budget";
import { rebalanceNetByJar } from "./jar-rebalance";
import type { Period } from "./types";

export interface JarBalanceFacts {
  /** Running balance as of `asOf`; `null` = no ledger entry ≤ asOf, or asOf < anchor. */
  balance: number | null;
  /** Σ deposits (opening included) with `createdAt ≤ asOf`. */
  deposited: number;
  /** Σ withdrawals with `createdAt ≤ asOf`. */
  withdrawn: number;
  /** Net expense over the jar's owned categories in [anchor, txnsTo]. */
  spentSinceAnchor: number;
  /** Net inter-jar rebalance (`Σ nhận − Σ cho`) in [anchor, txnsTo]. */
  rebalanceSinceAnchor: number;
  /** ISO anchor of the running balance, or `null` when the jar has none. */
  anchor: string | null;
  /** `self_reported` when funded (ledger-backed), else `mock` (the baseline). */
  source: DataSource;
}

/** A usable ledger row: finite, non-negative amount and a parseable timestamp. */
function usable(e: JarLedgerEntry): boolean {
  return Number.isFinite(e.amount) && e.amount >= 0 && Number.isFinite(Date.parse(e.createdAt));
}

function unfunded(anchor: string | null): JarBalanceFacts {
  return {
    balance: null,
    deposited: 0,
    withdrawn: 0,
    spentSinceAnchor: 0,
    rebalanceSinceAnchor: 0,
    anchor,
    source: "mock",
  };
}

/** Earliest `createdAt` (by instant) among `entries`, or `null` when empty. */
function earliest(entries: JarLedgerEntry[]): string | null {
  return entries.reduce<string | null>(
    (acc, e) => (acc === null || Date.parse(e.createdAt) < Date.parse(acc) ? e.createdAt : acc),
    null,
  );
}

/**
 * Per-jar running balance as of `asOf` (ISO). Keyed by jar id over `config.jars`
 * only; ledger rows for jars not in the config are ignored. Rows stamped after
 * `asOf` and non-finite/negative amounts are skipped (F08b parity). Spend and
 * rebalance are folded over `[anchor, txnsTo]` (default `asOf`).
 */
export function jarBalances(
  config: JarConfig,
  txns: Transaction[],
  asOf: string,
  txnsTo: string = asOf,
): Map<string, JarBalanceFacts> {
  const asOfMs = Date.parse(asOf);
  const catToJar = categoryToJarMap(config);
  const ledger = (config.ledger ?? []).filter(usable);
  // Memoised per anchor: after the migration most jars share one anchor, so the
  // O(txns) folds run once per distinct window rather than once per jar.
  const spendCache = new Map<string, Map<string, number>>();
  const rebalCache = new Map<string, Map<string, number>>();
  const windowOf = (anchor: string) => {
    if (!spendCache.has(anchor)) {
      const period: Period = { from: anchor, to: txnsTo, label: "" };
      spendCache.set(anchor, netExpenseByCategory(txns, period));
      rebalCache.set(anchor, rebalanceNetByJar(txns, period));
    }
    return { spend: spendCache.get(anchor)!, rebal: rebalCache.get(anchor)! };
  };

  const out = new Map<string, JarBalanceFacts>();
  for (const jar of config.jars) {
    const own = ledger.filter((e) => e.jarId === jar.id);
    const createdAt = jar.createdAt && Number.isFinite(Date.parse(jar.createdAt)) ? jar.createdAt : null;
    const anchor = createdAt ?? earliest(own);
    const visible = own.filter((e) => Date.parse(e.createdAt) <= asOfMs);
    // Unfunded as of `asOf`, or viewing a window that ends before the jar existed.
    if (anchor === null || visible.length === 0 || !(asOfMs >= Date.parse(anchor))) {
      out.set(jar.id, unfunded(anchor));
      continue;
    }
    const deposited = visible.filter((e) => e.kind === "deposit").reduce((s, e) => s + e.amount, 0);
    const withdrawn = visible.filter((e) => e.kind === "withdraw").reduce((s, e) => s + e.amount, 0);
    const { spend, rebal } = windowOf(anchor);
    const spentSinceAnchor = ownedCategories(jar.id, jar.categoryIds, catToJar).reduce(
      (s, c) => s + (spend.get(c) ?? 0),
      0,
    );
    const rawNet = rebal.get(jar.id) ?? 0;
    const rebalanceSinceAnchor = Number.isFinite(rawNet) ? rawNet : 0;
    out.set(jar.id, {
      balance: deposited - withdrawn - spentSinceAnchor + rebalanceSinceAnchor,
      deposited,
      withdrawn,
      spentSinceAnchor,
      rebalanceSinceAnchor,
      anchor,
      source: "self_reported",
    });
  }
  return out;
}

/** `min(period.to, now)` as ISO — the balance `asOf` for a viewed period (one clock). */
export function balanceAsOf(period: Period, now: Date): string {
  const nowMs = now.getTime();
  return Number.isFinite(nowMs) && nowMs < Date.parse(period.to) ? now.toISOString() : period.to;
}
