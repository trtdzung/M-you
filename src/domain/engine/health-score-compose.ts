/**
 * One composition of the Financial Health Score inputs, shared by every surface
 * that shows the score (Home snapshot on the server, Wrapped on the device), so
 * the same data always yields the same score. Pure: the caller passes `now`.
 */

import type { Account, Liability, Transaction } from "@/domain/models";
import type { FinancialHealthScoreResult } from "@/domain/models/health-score";
import { aggregateCashflow } from "./cashflow";
import type { Financials } from "./finance-compose";
import { computeFinancialHealthScore } from "./health-score";
import { addMonthsToKey, monthPeriodFromKey } from "./types";

/** Months of cash-flow history the multi-period metrics read (current month included). */
export const HEALTH_HISTORY_MONTHS = 6;

export interface HealthScoreComposeInput {
  /** `computeFinancials(...)` for `month` (cashflow, net worth, goals). */
  financials: Pick<Financials, "cashflow" | "networth" | "goals">;
  accounts: Account[];
  /** Provider + self-reported liabilities. */
  liabilities: Liability[];
  /** Engine view of the ledger (corrections applied, hidden rows excluded). */
  transactions: Transaction[];
  fixedCategoryIds: ReadonlySet<string>;
  /** "YYYY-MM" the score is computed for. */
  month: string;
  /** The self-reported profile is complete, so 0 liabilities really means no debt. */
  profileComplete: boolean;
  now: Date;
  /** Reporting date label (e.g. the VN day "YYYY-MM-DD"). */
  asOf: string;
}

export function composeFinancialHealthScore(input: HealthScoreComposeInput): FinancialHealthScoreResult {
  const monthlyCashflows = Array.from({ length: HEALTH_HISTORY_MONTHS }, (_, i) => {
    const key = addMonthsToKey(input.month, -i);
    const { income, expense } = aggregateCashflow(input.transactions, monthPeriodFromKey(key), input.fixedCategoryIds);
    return { month: key, income, expense };
  });
  return computeFinancialHealthScore({
    cashflow: input.financials.cashflow,
    monthlyCashflows,
    accounts: input.accounts,
    networth: input.financials.networth,
    liabilities: input.liabilities,
    liabilitiesConfirmedComplete: input.profileComplete,
    goals: input.financials.goals,
    now: input.now,
    asOf: input.asOf,
  });
}
