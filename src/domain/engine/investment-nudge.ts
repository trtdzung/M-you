/**
 * Investment feature engineering — extracts a rich set of financial signals
 * from the PFM engine's Financials composite for the current month and
 * forwards them to the M-Your agent endpoint.
 *
 * The agent decides:
 *  - Whether to recommend an investment product at all
 *  - Which product (m-sinh-loi / tiet-kiem / null)
 *  - The explanation and suggested action in Vietnamese
 *
 * PFM owns the numbers; the agent owns the product knowledge and the prose.
 * No thresholds or product selection live here — that is the agent's job.
 */

import type { Financials } from "./finance-compose";
import type { UnallocatedPoolResult } from "./unallocated-pool";

// ─── output types ─────────────────────────────────────────────────────────────

/**
 * All financial signals PFM can derive and send to the agent.
 * Every field is a primitive JSON-safe value (number | string | boolean | null).
 * "null" always means "genuinely unknown, not a silent 0" (invariant #6).
 */
export interface InvestmentFeatures {
  // ── Liquidity ──────────────────────────────────────────────────────────────
  /** CASA balance minus jar spendables. Null when no current account. */
  unallocated_balance: number | null;
  /** Months of liquid cash at current burn rate. Null when unknown. */
  runway_months: number | null;
  /** Band for runway: "good" | "warn" | "bad" | null */
  runway_band: string | null;

  // ── Cashflow (current month, posted only) ──────────────────────────────────
  /** Total posted income this month (VND). */
  income_this_month: number;
  /** Total net expense this month (VND). */
  expense_this_month: number;
  /** income − expense (may be negative). */
  net_this_month: number;
  /** Fixed (recurring/obligatory) expense share of total expense, [0,1] or null. */
  fixed_expense_ratio: number | null;

  // ── Month-on-month trend ────────────────────────────────────────────────────
  /** Expense change vs. last month in VND (positive = spending more). */
  mom_expense_delta: number;
  /** Expense change vs. last month as fraction (null when previous = 0). */
  mom_expense_pct: number | null;

  // ── Jar utilization ─────────────────────────────────────────────────────────
  /**
   * Average pct utilization across jars WITH a set limit, [0,1].
   * Null when no jar has a set limit.
   */
  avg_jar_utilization: number | null;
  /** Count of jars currently "over" or "near" their limit. */
  jars_at_risk_count: number;
  /** Count of jars with a set limit. */
  jars_with_limit_count: number;

  // ── Net worth snapshot ──────────────────────────────────────────────────────
  /** Total net worth (assets − liabilities), VND. */
  net_worth: number;
  /** Total assets, VND. */
  assets_total: number;
  /** Total liabilities, VND. */
  liabilities_total: number;
  /**
   * Largest-asset concentration, [0,1].
   * Null when no assets.
   */
  asset_concentration: number | null;
  /** True when some assets have unknown value (partial picture). */
  has_unknown_assets: boolean;

  // ── Savings rate (estimated) ─────────────────────────────────────────────────
  /**
   * (income − expense) / income over the current month, [0,1] or negative.
   * Null when income is zero.
   */
  savings_rate: number | null;

  // ── Goals ───────────────────────────────────────────────────────────────────
  /** Count of active financial goals. */
  goal_count: number;
  /**
   * Average goal completion ratio across all goals, [0,1].
   * Null when no goals.
   */
  avg_goal_completion: number | null;

  // ── Context ─────────────────────────────────────────────────────────────────
  /** ISO timestamp the features were computed for (DEMO_NOW). */
  as_of: string;
  source: "estimated";
}

/** Stable snapshot key: the features that matter for product selection. */
export function investmentFeaturesSnapshot(f: InvestmentFeatures): string {
  return JSON.stringify([
    f.as_of,
    f.unallocated_balance,
    f.runway_months,
    f.savings_rate,
    f.income_this_month,
    f.net_this_month,
    f.avg_jar_utilization,
    f.jars_at_risk_count,
    f.net_worth,
    f.goal_count,
  ]);
}

// ─── feature extraction ───────────────────────────────────────────────────────

/**
 * Extract investment features from the current month's Financials.
 * Pure — same inputs always yield same outputs. Never fabricates a number.
 */
export function extractInvestmentFeatures(
  financials: Financials,
  now: Date,
): InvestmentFeatures {
  const cf = financials.cashflow;
  const pcf = financials.prevCashflow;
  const nw = financials.networth;
  const jb = financials.jarBudget;
  const pool = financials.unallocatedPool;
  const health = financials.health;

  // ── unallocated balance ───────────────────────────────────────────────────
  const unallocated_balance: number | null =
    pool.amount === "unknown" ? null : pool.amount;

  // ── runway ────────────────────────────────────────────────────────────────
  const runway_months = health.runwayMonths.value;
  const runway_band = health.runwayMonths.band;

  // ── cashflow ──────────────────────────────────────────────────────────────
  const income_this_month = cf.income;
  const expense_this_month = cf.expense;
  const net_this_month = cf.net;
  const fixed_expense_ratio =
    cf.expense > 0 ? cf.fixed / cf.expense : null;

  // ── MoM trend ─────────────────────────────────────────────────────────────
  const mom_expense_delta = cf.expense - pcf.expense;
  const mom_expense_pct =
    pcf.expense > 0 ? (cf.expense - pcf.expense) / pcf.expense : null;

  // ── jar utilization ───────────────────────────────────────────────────────
  const setLines = jb.lines.filter((l) => l.limitState === "set" && l.limit !== null);
  const jars_with_limit_count = setLines.length;
  const jars_at_risk_count = jb.lines.filter(
    (l) => l.status === "over" || l.status === "near",
  ).length;
  const avg_jar_utilization =
    setLines.length > 0
      ? setLines.reduce((sum, l) => {
          const pct = l.limit! > 0 ? l.spent / l.limit! : 0;
          return sum + Math.max(0, Math.min(1, pct));
        }, 0) / setLines.length
      : null;

  // ── net worth ─────────────────────────────────────────────────────────────
  const net_worth = nw.total;
  const assets_total = nw.assetsTotal;
  const liabilities_total = nw.liabilitiesTotal;
  const assetAmounts = nw.breakdown
    .filter((b) => b.kind === "asset")
    .map((b) => b.amount);
  const largest = assetAmounts.reduce((m, v) => Math.max(m, v), 0);
  const asset_concentration =
    nw.assetsTotal > 0 ? largest / nw.assetsTotal : null;
  const has_unknown_assets = nw.hasUnknown;

  // ── savings rate ──────────────────────────────────────────────────────────
  const savings_rate =
    cf.income > 0 ? (cf.income - cf.expense) / cf.income : null;

  // ── goals ─────────────────────────────────────────────────────────────────
  const goals = financials.goals;
  const goal_count = goals.length;
  const avg_goal_completion =
    goals.length > 0
      ? goals.reduce((sum, g) => {
          const ratio =
            g.targetAmount > 0
              ? Math.min(1, g.currentAmount / g.targetAmount)
              : 1;
          return sum + ratio;
        }, 0) / goals.length
      : null;

  return {
    unallocated_balance,
    runway_months,
    runway_band,
    income_this_month,
    expense_this_month,
    net_this_month,
    fixed_expense_ratio,
    mom_expense_delta,
    mom_expense_pct,
    avg_jar_utilization,
    jars_at_risk_count,
    jars_with_limit_count,
    net_worth,
    assets_total,
    liabilities_total,
    asset_concentration,
    has_unknown_assets,
    savings_rate,
    goal_count,
    avg_goal_completion,
    as_of: now.toISOString(),
    source: "estimated",
  };
}
