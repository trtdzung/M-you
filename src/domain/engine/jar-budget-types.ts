/**
 * Result types of the jar budget engine (`jar-budget.ts`), split out to keep the
 * engine file focused. Two axes per line: the monthly LIMIT (`spent` vs `limit`,
 * resets each month) and the running BALANCE (`balance`, from `jarBalances`).
 */

import type { DataSource } from "@/domain/models";
import type { PressureStatus } from "./pressure";
import type { AggregateMeta } from "./types";

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
  /**
   * Monthly limit, or `null` when unset (unknown — never coerced to 0). A corrupt
   * stored limit (non-finite / negative) is treated as unset, never a NaN.
   */
  limit: number | null;
  limitState: LimitState;
  /** Net inter-jar rebalance this period (`Σ nhận − Σ cho`); 0 when untouched. */
  rebalanceNet: number;
  /**
   * **TRỤC SỐ DƯ** — the jar's running balance ("số dư hũ") from `jarBalances`:
   * Σ nạp − Σ rút − đã chi + (Σ nhận − Σ cho) since the jar's anchor, as of
   * `min(period.to, now)`. `null` = chưa có số dư (unfunded, or the period ends
   * before the anchor) — never 0. Independent of `limit`; may be negative.
   */
  balance: number | null;
  /** `spent / limit` in [0, ∞), or `null` when unset — the PLAN axis, never the balance. */
  pct: number | null;
  /**
   * **TRỤC HẠN MỨC** — ok/near/over measured against the ORIGINAL `limit` when set,
   * else `null`: `over` ⇔ `spent > limit`. An inter-jar transfer moves balance, never
   * the plan, so a jar covered back to a ≥ 0 balance STILL reads "over" while its
   * spend exceeds its own limit (⇔ envelope `overLimit`). "Hết tiền" is the separate
   * balance axis (`balance < 0` → `jarNeedsManualTopUp`). Unset jar → no status.
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
  /** Σ period rebalance net over the SET jars ("nhận/cho tháng này" display). */
  totalRebalanceNet: number;
  /**
   * Σ running balance over the jars whose balance is KNOWN (unfunded jars are
   * excluded, never counted as 0), or `null` when no jar has a balance.
   */
  totalBalance: number | null;
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
