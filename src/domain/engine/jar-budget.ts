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
 *    is genuinely unknown, so `remaining`/`pct`/`status` are `null`, NEVER a 0 or
 *    a false "ok" (invariant #6). The total gauge counts only jars with a set
 *    limit; unset jars are listed separately.
 *  - `now` is injected so `daysLeft`/MoM are testable (red-team L1).
 *  - Every line carries provenance (source + freshness) over its own spend.
 */

import type { DataSource, JarConfig, Transaction } from "@/domain/models";
import { netExpenseByCategory } from "./cashflow";
import { categoryToJarMap } from "./category-jars";
import { NEAR_THRESHOLD, daysLeftIn, type PressureStatus } from "./pressure";
import { lowestTrust } from "./provenance";
import { coverageOf, type AggregateMeta, type Period } from "./types";

export type LimitState = "set" | "unset";

/** One jar's budget line for a period. `null` fields mean "chưa đặt / unknown". */
export interface JarBudgetLine {
  huId: string;
  label: string;
  categoryIds: string[];
  /** Net expense over this jar's categories for the period (whole VND). */
  spent: number;
  /** Net expense last period — the MoM comparison base. */
  prevSpent: number;
  /** `spent - prevSpent` (VND). Positive = spending more than last period. */
  momDelta: number;
  /** `(spent - prevSpent) / prevSpent`, or `null` when `prevSpent <= 0`. */
  momPct: number | null;
  /** Monthly limit, or `null` when unset (unknown — never coerced to 0). */
  limit: number | null;
  limitState: LimitState;
  /** `limit - spent` when set, else `null`. */
  remaining: number | null;
  /** `spent / limit` in [0, ∞), or `null` when unset. */
  pct: number | null;
  /** ok/near/over when set, else `null` — an unset jar has no status. */
  status: PressureStatus | null;
  /** True when a SET limit is ≥ 80% used. Always false when unset. */
  thresholdHit: boolean;
  /** Lowest-trust provenance over the contributing spend (invariant #5). */
  source: DataSource;
  /** ISO of the most recent contributing transaction, or `null`. */
  freshness: string | null;
}

export interface JarBudgetSummary {
  /** Σ limits of jars that HAVE a limit, or `null` when none is set. */
  totalLimit: number | null;
  /** Σ spent over every configured jar (all mapped categories). */
  totalSpent: number;
  /** Σ spent over ONLY the jars with a set limit (the gauge numerator). */
  totalSpentSet: number;
  /** `totalLimit - totalSpentSet` when any limit is set, else `null`. */
  totalRemaining: number | null;
  /** `totalSpentSet / totalLimit` in [0, ∞), or `null` when nothing is set. */
  pctUsed: number | null;
  /** Whole days remaining in the period from `now`. */
  daysLeft: number;
  setCount: number;
  unsetCount: number;
}

export interface JarBudgetResult {
  lines: JarBudgetLine[];
  summary: JarBudgetSummary;
  meta: AggregateMeta;
}

const EXPENSE_TYPES: ReadonlySet<Transaction["type"]> = new Set(["expense", "fee", "refund"]);

/** Classify usage against a set limit. A set limit of 0 is "over" once anything is spent. */
function jarStatus(spent: number, limit: number): PressureStatus {
  if (limit <= 0) return spent > 0 ? "over" : "ok";
  if (spent > limit) return "over";
  if (spent / limit >= NEAR_THRESHOLD) return "near";
  return "ok";
}

/**
 * Per-category provenance (source + freshness) for posted spend in `period`,
 * mirroring the cashflow rule (posted expense/fee/refund only). Kept separate
 * from `netExpenseByCategory` (which returns amounts) so the amount path stays the
 * single canonical rule while lines still carry provenance (invariant #5).
 */
function provenanceByCategory(
  txns: Transaction[],
  period: Period,
): Map<string, { sources: DataSource[]; latest: string | null }> {
  const map = new Map<string, { sources: DataSource[]; latest: string | null }>();
  for (const t of txns) {
    if (t.status !== "posted" || t.postedAt < period.from || t.postedAt > period.to) continue;
    if (!EXPENSE_TYPES.has(t.type)) continue;
    const entry = map.get(t.categoryId) ?? { sources: [], latest: null };
    entry.sources.push(t.source);
    if (!entry.latest || t.postedAt > entry.latest) entry.latest = t.postedAt;
    map.set(t.categoryId, entry);
  }
  return map;
}

/**
 * Compute the per-jar budget for `period` vs `prevPeriod`. Pure and deterministic;
 * `now` is injected for `daysLeft`. Jars keep config order; the "Khác" catch-all
 * (if present in config) is treated like any other jar.
 */
export function evaluateJarBudget(
  config: JarConfig,
  txns: Transaction[],
  period: Period,
  prevPeriod: Period,
  now: Date,
): JarBudgetResult {
  const spendNow = netExpenseByCategory(txns, period);
  const spendPrev = netExpenseByCategory(txns, prevPeriod);
  const provNow = provenanceByCategory(txns, period);
  const catToJar = categoryToJarMap(config);

  const lines: JarBudgetLine[] = config.jars.map((jar) => {
    const spent = jar.categoryIds.reduce((s, c) => s + (spendNow.get(c) ?? 0), 0);
    const prevSpent = jar.categoryIds.reduce((s, c) => s + (spendPrev.get(c) ?? 0), 0);
    const momDelta = spent - prevSpent;
    const momPct = prevSpent > 0 ? momDelta / prevSpent : null;

    const hasLimit = jar.budgetLimit !== undefined;
    const limit = hasLimit ? (jar.budgetLimit as number) : null;
    const status = hasLimit ? jarStatus(spent, limit as number) : null;
    const pct = hasLimit ? ((limit as number) > 0 ? spent / (limit as number) : spent > 0 ? 1 : 0) : null;

    const sources = jar.categoryIds.flatMap((c) => provNow.get(c)?.sources ?? []);
    const latest = jar.categoryIds.reduce<string | null>((acc, c) => {
      const f = provNow.get(c)?.latest ?? null;
      return f && (!acc || f > acc) ? f : acc;
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
      limitState: hasLimit ? "set" : "unset",
      remaining: hasLimit ? (limit as number) - spent : null,
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

  const summary: JarBudgetSummary = {
    totalLimit,
    totalSpent,
    totalSpentSet,
    totalRemaining: totalLimit !== null ? totalLimit - totalSpentSet : null,
    pctUsed: totalLimit !== null && totalLimit > 0 ? totalSpentSet / totalLimit : null,
    daysLeft: daysLeftIn(period, now),
    setCount: setLines.length,
    unsetCount: lines.length - setLines.length,
  };

  // Result-level provenance over every contributing category (unmapped categories
  // are not this engine's concern — the "Khác" jar, if configured, covers them).
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
