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
  DataSource,
  Goal,
  JarConfig,
  Liability,
  MockProduct,
  MonthlySnapshot,
  Transaction,
} from "@/domain/models";
import {
  aggregateCashflow,
  calculateNetWorth,
  cashRunwayMonths,
  dateToMonthKey,
  detectRecurring,
  estimateEndOfMonth,
  evaluateBudget,
  evaluateJars,
  monthPeriodFromKey,
  networthTrend,
  resolveIncomeBasis,
  spendingByCategory,
  upcomingObligations,
  type BudgetLine,
  type CashflowResult,
  type CashRunway,
  type CategorySpend,
  type EndOfMonthEstimate,
  type JarLine,
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
  /** Spending-jar lines (empty when no jar config supplied). */
  jarLines: JarLine[];
  /** Income basis feeding percent-mode jars — unknown until salary/override. */
  jarIncomeBasis: { value: number | "unknown"; source: DataSource };
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
  const period = monthPeriodFromKey(month);
  const prevPeriod = monthPeriodFromKey(prevMonthKey(month));
  const recurring = detectRecurring(txns);
  const cashflow = aggregateCashflow(txns, period);
  const obligations = upcomingObligations(recurring, raw.liabilities, { now, horizonDays: 30 });
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

  const jarConfig: JarConfig = options.jarConfig ?? { version: 1, jars: [], incomeBasis: "auto" };
  // Resolve income from the same (correction-applied) txns `recurring` was
  // detected from — not `raw.transactions` — so salary provenance stays in sync.
  const jarIncome = resolveIncomeBasis(jarConfig, { transactions: txns }, recurring);
  const jarLines = evaluateJars(jarConfig, txns, period, now, jarIncome);

  return {
    monthKey: month,
    cashflow,
    prevCashflow: aggregateCashflow(txns, prevPeriod),
    networth: calculateNetWorth(raw.assets, raw.liabilities),
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
    jarLines,
    jarIncomeBasis: { value: jarIncome.value, source: jarIncome.source },
  };
}
