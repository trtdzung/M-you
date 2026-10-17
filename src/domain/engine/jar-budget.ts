/**
 * Jar budget engine (BIDV wallet model, plan 260910-1626) — the deterministic
 * truth for "đã tiêu vs hạn mức" per jar. A jar groups expense categories and
 * carries an optional monthly `budgetLimit`; this folds the period's net expense
 * over each jar's categories and compares it to the limit.
 *
 * Named `jar-budget` to avoid colliding with the per-category `budget.ts` (H3);
 * the two are reconciled in phase 08. Invariants honoured:
 *  - Spend reuses `netExpenseByCategory` (cashflow rules: internal transfers +
 *    card payments excluded, refunds reverse, reversed excluded, pending kept
 *    separate) — this never re-derives cash flow (DRY, invariant #2).
 *  - A jar with `budgetLimit === undefined` is `limitState: "unset"` — its limit
 *    is genuinely unknown, so `pct`/`status` are `null`, NEVER a 0 or a false
 *    "ok" (invariant #6). The total gauge counts only jars with a set limit; unset
 *    jars are listed separately.
 *  - LIMIT ≠ BALANCE (plan 260923): this engine owns the monthly LIMIT axis only.
 *    Each line's running `balance` is threaded in from `jarBalances` (the stock
 *    axis, carried across months) — it is never re-derived here.
 *  - `now` is injected so `daysLeft`/MoM are testable (red-team L1).
 *  - Every line carries provenance (source + freshness) over its own spend.
 */

import type { JarConfig, Transaction } from "@/domain/models";
import { netExpenseByCategory } from "./cashflow";
import { categoryToJarMap } from "./category-jars";
import { provenanceByCategory } from "./jar-budget-provenance";
import type { JarBudgetLine, JarBudgetResult, JarBudgetSummary } from "./jar-budget-types";
import { NEAR_THRESHOLD, daysLeftIn, type PressureStatus } from "./pressure";
import { lowestTrust } from "./provenance";
import type { JarBalanceFacts } from "./jar-balance";
import { coverageOf, type AggregateMeta, type Period } from "./types";

export type { JarBudgetLine, JarBudgetResult, JarBudgetSummary, LimitState } from "./jar-budget-types";

/**
 * Classify usage against the jar's OWN limit — the plan the user set. An inter-jar
 * transfer never raises or lowers this ceiling, so `over` is exactly `spent > limit`
 * whatever coverage arrived. A limit ≤ 0 is "over" once anything is spent.
 */
function jarStatus(spent: number, limit: number): PressureStatus {
  if (spent > limit) return "over";
  if (limit <= 0) return "ok";
  if (spent / limit >= NEAR_THRESHOLD) return "near";
  return "ok";
}

/** Usage ratio vs the jar's own limit; finite for a ≤ 0 ceiling (1 when over, else 0). */
function jarPct(spent: number, limit: number): number {
  if (limit > 0) return spent / limit;
  return spent > limit ? 1 : 0;
}

/** A usable stored limit: a finite, non-negative number. Anything else is "unset". */
export function validBudgetLimit(limit: unknown): number | null {
  return typeof limit === "number" && Number.isFinite(limit) && limit >= 0 ? limit : null;
}

/**
 * The categories a jar is the FIRST owner of (`categoryToJarMap` first-wins), de-
 * duplicated — so a category claimed by two jars (dirty config) is counted once.
 */
export function ownedCategories(jarId: string, categoryIds: string[], catToJar: Map<string, string>): string[] {
  return Array.from(new Set(categoryIds)).filter((c) => catToJar.get(c) === jarId);
}

/**
 * Compute the per-jar budget for `period` vs `prevPeriod`. Pure and deterministic;
 * `now` is injected for `daysLeft`. Jars keep config order. A category in no jar is
 * simply not part of any jar's budget ("chưa xếp hũ" — the reports group it separately).
 */
export function evaluateJarBudget(
  config: JarConfig,
  txns: Transaction[],
  period: Period,
  prevPeriod: Period,
  now: Date,
  /**
   * Net inter-jar rebalance per jar for `period` (`Σ nhận − Σ cho`, from
   * `rebalanceNetByJar`) — the line's `rebalanceNet` display only. Absent → 0.
   */
  rebalanceNetByJar?: Map<string, number>,
  /** Running balances from `jarBalances` (same `now`). Absent → every `balance` is `null`. */
  balances?: Map<string, JarBalanceFacts>,
): JarBudgetResult {
  const spendNow = netExpenseByCategory(txns, period);
  const spendPrev = netExpenseByCategory(txns, prevPeriod);
  const provNow = provenanceByCategory(txns, period);
  const catToJar = categoryToJarMap(config);

  const lines: JarBudgetLine[] = config.jars.map((jar) => {
    // B07: a category counts only in its first-owner jar (never double-counted).
    const owned = ownedCategories(jar.id, jar.categoryIds, catToJar);
    const spent = owned.reduce((s, c) => s + (spendNow.get(c) ?? 0), 0);
    const prevSpent = owned.reduce((s, c) => s + (spendPrev.get(c) ?? 0), 0);
    const momDelta = spent - prevSpent;
    const momPct = prevSpent > 0 ? momDelta / prevSpent : null;
    // Rebalance coverage (Σ nhận − Σ cho) moves the SỐ DƯ only (via `balances`). It
    // never touches the ceiling, and `spent` (đã tiêu) stays raw truth — so the
    // verdict below reads the plan the user actually set.
    const rawNet = rebalanceNetByJar?.get(jar.id) ?? 0;
    const rebalanceNet = Number.isFinite(rawNet) ? rawNet : 0;

    const limit = validBudgetLimit(jar.budgetLimit);
    const status = limit !== null ? jarStatus(spent, limit) : null;
    const pct = limit !== null ? jarPct(spent, limit) : null;

    const sources = owned.flatMap((c) => provNow.get(c)?.sources ?? []);
    const latest = owned.reduce<string | null>((acc, c) => {
      const f = provNow.get(c)?.latest ?? null;
      return f && (!acc || Date.parse(f) > Date.parse(acc)) ? f : acc;
    }, null);

    return {
      huId: jar.id,
      label: jar.label,
      categoryIds: jar.categoryIds,
      spent,
      prevSpent,
      momDelta,
      momPct,
      limit,
      limitState: limit !== null ? "set" : "unset",
      rebalanceNet,
      balance: balances?.get(jar.id)?.balance ?? null,
      pct,
      status,
      thresholdHit: pct !== null && pct >= NEAR_THRESHOLD,
      source: lowestTrust(sources),
      freshness: latest,
    };
  });

  const setLines = lines.filter((l) => l.limitState === "set");
  const totalLimit = setLines.length > 0 ? setLines.reduce((s, l) => s + (l.limit as number), 0) : null;
  const totalSpentSet = setLines.reduce((s, l) => s + l.spent, 0);
  const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
  const totalRebalanceNet = setLines.reduce((s, l) => s + l.rebalanceNet, 0);
  const known = lines.filter((l) => l.balance !== null);
  const totalBalance = known.length > 0 ? known.reduce((s, l) => s + (l.balance as number), 0) : null;

  const summary: JarBudgetSummary = {
    totalLimit,
    totalSpent,
    totalSpentSet,
    totalRebalanceNet,
    totalBalance,
    pctUsed: totalLimit !== null && totalLimit > 0 ? totalSpentSet / totalLimit : null,
    daysLeft: daysLeftIn(period, now),
    setCount: setLines.length,
    unsetCount: lines.length - setLines.length,
  };

  // Result-level provenance over every contributing category (unmapped categories
  // are not this engine's concern — they belong to no jar's budget).
  const allSources = Array.from(catToJar.keys()).flatMap((c) => provNow.get(c)?.sources ?? []);
  const freshness = lines.reduce<string | null>(
    (acc, l) => (l.freshness && (!acc || l.freshness > acc) ? l.freshness : acc),
    null,
  );
  const meta: AggregateMeta = {
    period,
    sourceCoverage: coverageOf(allSources, allSources.length, 0),
    freshness,
  };

  return { lines, summary, meta };
}
