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
  Liability,
  MockProduct,
  MonthlySnapshot,
  Transaction,
} from "@/domain/models";
import {
  aggregateCashflow,
  calculateNetWorth,
  detectRecurring,
  evaluateBudget,
  monthPeriodFromKey,
  spendingByCategory,
  upcomingObligations,
  type BudgetLine,
  type CashflowResult,
  type CategorySpend,
  type NetWorthResult,
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
}

export interface ComposeOptions {
  /** Reference "now" (defaults to the demo clock). */
  now?: Date;
  /**
   * Transactions to compute from — defaults to `raw.transactions`. The client
   * hook passes correction-applied transactions here; the server passes none.
   */
  transactions?: Transaction[];
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

  return {
    monthKey: month,
    cashflow: aggregateCashflow(txns, period),
    prevCashflow: aggregateCashflow(txns, prevPeriod),
    networth: calculateNetWorth(raw.assets, raw.liabilities),
    budgetLines: evaluateBudget(raw.budgets, txns, period, now),
    categorySpend: spendingByCategory(txns, period),
    recurring,
    obligations: upcomingObligations(recurring, raw.liabilities, { now, horizonDays: 30 }),
  };
}
