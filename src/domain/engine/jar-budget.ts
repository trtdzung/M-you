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

import type { DataSource, JarConfig, JarRole, Transaction } from "@/domain/models";
import { inPeriod, netExpenseByCategory } from "./cashflow";
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
  /**
   * Donor-waterfall role from `JarConfig` (see `JarRole`), threaded through so the
   * transfer picker's `JarSpendable` carries the REAL role (not a `spending`
   * fallback). Optional for a legacy jar stored without one.
   */
  role?: JarRole;
  /** Net expense over this jar's categories for the period (whole VND). */
  spent: number;
  /** Net expense last period — the MoM comparison base. */
  prevSpent: number;
  /** `spent - prevSpent` (VND). Positive = spending more than last period. */
  momDelta: number;
  /** `(spent - prevSpent) / prevSpent`, or `null` when `prevSpent <= 0`. */
  momPct: number | null;
  /**
   * Monthly limit, or `null` when unset (unknown — never coerced to 0). A corrupt
   * stored limit (non-finite / negative) is treated as unset, never a NaN.
   */
  limit: number | null;
  limitState: LimitState;
  /** Net inter-jar rebalance this period (`Σ nhận − Σ cho`); 0 when untouched. */
  rebalanceNet: number;
  /**
   * **TRỤC SỐ DƯ** — `limit − spent + Σ nhận − Σ cho` (rebalance net) when set, else
   * `null`. This IS the jar's balance ("số dư hũ"): the money still available to
   * spend. Folds inter-jar rebalance coverage so the derived `spendable`/pool every
   * screen reads reflects a transfer instantly. `spent` itself is UNCHANGED.
   */
  remaining: number | null;
  /** `spent / limit` in [0, ∞), or `null` when unset — the PLAN axis, never the balance. */
  pct: number | null;
  /**
   * **TRỤC HẠN MỨC** — ok/near/over measured against the ORIGINAL `limit` when set,
   * else `null`: `over` ⇔ `spent > limit`. An inter-jar transfer moves balance, never
   * the plan, so a jar covered back to a ≥ 0 balance STILL reads "over" while its
   * spend exceeds its own limit (⇔ envelope `overLimit`). "Hết tiền" is the separate
   * balance axis (`remaining < 0` → `jarNeedsManualTopUp`). Unset jar → no status.
   */
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
  /**
   * Σ rebalance net over the SET jars (legs to/from the pool, unset or deleted jars
   * make it non-zero). `totalRemaining = totalLimit − totalSpentSet + this`, so a
   * header can show the adjustment and still add up (U22).
   */
  totalRebalanceNet: number;
  /** `totalLimit − totalSpentSet + totalRebalanceNet` when any limit is set, else `null`. */
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
function ownedCategories(jarId: string, categoryIds: string[], catToJar: Map<string, string>): string[] {
  return Array.from(new Set(categoryIds)).filter((c) => catToJar.get(c) === jarId);
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
    if (t.status !== "posted" || !inPeriod(t, period)) continue;
    if (!EXPENSE_TYPES.has(t.type)) continue;
    const entry = map.get(t.categoryId) ?? { sources: [], latest: null };
    entry.sources.push(t.source);
    if (!entry.latest || Date.parse(t.postedAt) > Date.parse(entry.latest)) entry.latest = t.postedAt;
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
  /**
   * Net inter-jar rebalance per jar (`Σ nhận − Σ cho`, from `rebalanceNetByJar`).
   * Folded into each line's `remaining` (+ `totalRemaining`); `spent` is untouched.
   * Absent → no rebalances (every jar's net is 0), preserving the pre-Phase-03 result.
   */
  rebalanceNetByJar?: Map<string, number>,
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
    // Rebalance coverage (Σ nhận − Σ cho) moves the SỐ DƯ only. It never touches the
    // ceiling, and `spent` (đã tiêu) stays raw truth — so the verdict below reads the
    // plan the user actually set, not one a transfer rewrote behind their back.
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
      role: jar.role,
      spent,
      prevSpent,
      momDelta,
      momPct,
      limit,
      limitState: limit !== null ? "set" : "unset",
      rebalanceNet,
      remaining: limit !== null ? limit - spent + rebalanceNet : null,
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
  // Sum the per-line remaining (each already folds its rebalance net) so the gauge
  // total matches `Σ(limit − spent + net)`, not the pre-rebalance `limit − spent`.
  const totalRemaining =
    totalLimit !== null ? setLines.reduce((s, l) => s + (l.remaining as number), 0) : null;

  const summary: JarBudgetSummary = {
    totalLimit,
    totalSpent,
    totalSpentSet,
    totalRebalanceNet,
    totalRemaining,
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
