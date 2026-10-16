/**
 * Pure financial composition — the single place provider data + the deterministic
 * engine are combined for a selected month. Extracted from the React hook so the
 * exact same numbers can be computed server-side (AI facade) without React.
 *
 * No React, no providers, no I/O: raw data in, `Financials` out. The client hook
 * (`useFinancials`) wraps this with state; the server AI context reuses it.
 */

import type {
  Account,
  Asset,
  Budget,
  Goal,
  JarConfig,
  Liability,
  MockProduct,
  MonthlySnapshot,
  Transaction,
} from "@/domain/models";
import {
  aggregateCashflow,
  assertPartitionBalances,
  calculateNetWorth,
  cashRunwayMonths,
  dateToMonthKey,
  detectRecurring,
  estimateEndOfMonth,
  evaluateBudget,
  evaluateJarPartition,
  financialHealth,
  monthPeriodFromKey,
  networthTrend,
  resolvePrimaryAccount,
  spendingByCategory,
  upcomingObligations,
  type BudgetLine,
  type CashflowResult,
  type CashRunway,
  type CategorySpend,
  type EndOfMonthEstimate,
  type FinancialHealth,
  type JarPartitionResult,
  type NetWorthResult,
  type NetWorthTrendMeta,
  type Obligation,
  type RecurringSeries,
} from "./index";
import { DEMO_NOW, prevMonthKey } from "@/lib/demo-clock";

/** Everything a provider bundle yields for one persona (loaded once). */
export interface RawData {
  transactions: Transaction[];
  accounts: Account[];
  assets: Asset[];
  liabilities: Liability[];
  budgets: Budget[];
  snapshots: MonthlySnapshot[];
  goals: Goal[];
  products: MockProduct[];
}

/** Derived financial figures for a single month — the app's shared truth. */
export interface Financials {
  monthKey: string;
  cashflow: CashflowResult;
  prevCashflow: CashflowResult;
  networth: NetWorthResult;
  budgetLines: BudgetLine[];
  categorySpend: CategorySpend[];
  recurring: RecurringSeries[];
  obligations: Obligation[];
  /** Projected liquid cash at month end (Red Team C2 — current month only). */
  endOfMonth: EndOfMonthEstimate;
  /** Months of liquid cash at the current burn rate. */
  runway: CashRunway;
  /**
   * Net-worth delta inputs (Red Team C3 — raw values for `DeltaBadge`, never a
   * reinvented delta object) + sparkline series. Null when no snapshot exists.
   */
  networthCurrent: number | null;
  networthPrevious: number | null;
  networthSeries: number[];
  /** Lowest-trust provenance over the exact snapshots feeding the series (H2). */
  networthSeriesMeta: NetWorthTrendMeta;
  /**
   * Snapshot partition of the current primary-account balance (Model A):
   * explicit jar earmarks + a "Chưa phân bổ" residual, `Σ ≡ balance`. Status is
   * "unknown" when the primary account is ambiguous (0 or 2+ current accounts).
   */
  jarPartition: JarPartitionResult;
  /**
   * Financial-health indicators (runway, surplus, essential coverage, asset
   * concentration). Composed ONCE here so Tổng quan + Kế hoạch read one object
   * (DRY) — no screen recomputes health locally. Missing inputs stay `null`.
   */
  health: FinancialHealth;
  /**
   * Seed (provider) goals + user-authored goals — the single merged goal view
   * (Phase 05). Kế hoạch (goal list, surplus what-if) reads THIS so a create/
   * edit/delete recomputes live and nothing is double-counted (the provider's
   * `listGoals()` stays seed-only, red-team #2/#3).
   */
  goals: Goal[];
}

export interface ComposeOptions {
  /** Reference "now" (defaults to the demo clock). */
  now?: Date;
  /**
   * Transactions to compute from — defaults to `raw.transactions`. The client
   * hook passes correction-applied transactions here; the server passes none.
   */
  transactions?: Transaction[];
  /**
   * User jar configuration (Phase 02 supplies the provider-backed value). Absent
   * → no jars are evaluated and `jarLines` is empty. Kept out of `RawData` so the
   * compose stays pure and testable (config is user state, not provider data).
   */
  jarConfig?: JarConfig;
  /**
   * User-authored assets/liabilities (Phase 03), threaded like `jarConfig` — they
   * are context state merged with the seed here, NOT folded into the provider's
   * `listAssets()`/`listLiabilities()` (which stay seed-only). This is the single
   * source of truth for user records; keeping them separate avoids double-counting
   * net worth (red-team #3) and lets a mutation recompute live (red-team #2).
   */
  userAssets?: Asset[];
  userLiabilities?: Liability[];
  /**
   * User-authored goals (Phase 05), threaded like `userAssets` — context state
   * merged with the seed goals here, NOT folded into the provider's `listGoals()`
   * (which stays seed-only). Single source of truth; a mutation recomputes live
   * (red-team #2) with no double-count (red-team #3).
   */
  userGoals?: Goal[];
}

/**
 * Compose derived financials for `month` ("YYYY-MM") from raw provider data.
 * Deterministic: identical inputs always yield identical output.
 */
export function computeFinancials(
  raw: RawData,
  month: string,
  options: ComposeOptions = {},
): Financials {
  const now = options.now ?? DEMO_NOW;
  const txns = options.transactions ?? raw.transactions;
  // Seed (provider) records + user-authored records — the single merged view the
  // engine sees. The provider reads stay seed-only, so nothing is double-counted.
  const assets = [...raw.assets, ...(options.userAssets ?? [])];
  const liabilities = [...raw.liabilities, ...(options.userLiabilities ?? [])];
  const period = monthPeriodFromKey(month);
  const prevPeriod = monthPeriodFromKey(prevMonthKey(month));
  const recurring = detectRecurring(txns);
  const cashflow = aggregateCashflow(txns, period);
  const obligations = upcomingObligations(recurring, liabilities, { now, horizonDays: 30 });
  const trend = networthTrend(raw.snapshots);

  // The end-of-month projection is only meaningful when the displayed month IS
  // the current month — its `now`-anchored obligations and run-rate proration
  // assume `now` falls inside `month` (Red Team C2). For any other month the
  // value is genuinely unknown rather than a misleading number. This guards
  // every caller (incl. the future AI facade), not just the Overview wiring.
  const isCurrentMonth = month === dateToMonthKey(now);
  const endOfMonth: EndOfMonthEstimate = isCurrentMonth
    ? estimateEndOfMonth(raw.accounts, cashflow, recurring, obligations, now)
    : { value: "unknown", meta: { source: "estimated", freshness: cashflow.meta.freshness } };

  const jarConfig: JarConfig = options.jarConfig ?? { version: 2, jars: [] };
  // Partition the CURRENT balance (Model A): earmarks resolve against the primary
  // account, the per-jar "đã tiêu" overlay uses the selected + previous period.
  const jarPartition = evaluateJarPartition(
    jarConfig,
    resolvePrimaryAccount(raw.accounts),
    txns,
    period,
    prevPeriod,
  );
  // Dev-only defence-in-depth: `Σ earmark === balance`. No-op in production.
  assertPartitionBalances(jarPartition);

  // Net worth is composed once and reused for `health` (DRY) so the concentration
  // indicator sees the exact same breakdown as the headline. Uses the merged
  // seed + user records (user assets/liabilities are context state, red-team #3).
  const networth = calculateNetWorth(assets, liabilities);

  return {
    monthKey: month,
    cashflow,
    prevCashflow: aggregateCashflow(txns, prevPeriod),
    networth,
    budgetLines: evaluateBudget(raw.budgets, txns, period, now),
    categorySpend: spendingByCategory(txns, period),
    recurring,
    obligations,
    endOfMonth,
    runway: cashRunwayMonths(raw.accounts, cashflow.expense),
    networthCurrent: trend.current,
    networthPrevious: trend.previous,
    networthSeries: trend.series,
    networthSeriesMeta: trend.meta,
    jarPartition,
    health: financialHealth(cashflow, raw.accounts, networth),
    goals: [...raw.goals, ...(options.userGoals ?? [])],
  };
}
