// Shapes of the advisor's server-side context. Amounts are integer VND; unknown stays unknown.
import type { GoalProgressState } from "../model/types";
import type { CategoryAverage } from "../engine/levers/cut-category";

export type Amount = number | "unknown";

export interface AdvisorMonth {
  monthKey: string;
  income: number;
  expense: number;
  txnCount: number;
}

/** One health indicator: raw ratio plus its 0/50/100 band score (both null when not computable). */
export interface HealthMetric {
  value: number | null;
  score: 0 | 50 | 100 | null;
}

export interface AdvisorHealth {
  /** Chi / thu, 3 months. */
  spendRatio: HealthMetric;
  /** No payment history in the data -> always null today. */
  onTimePayment: HealthMetric;
  /** (current + savings) / essential monthly spend, in months. */
  emergencyFund: HealthMetric;
  /** Savings transfers / income, 3 months. */
  steadySaving: HealthMetric;
  /** Card payments / income, 3 months. */
  debtToIncome: HealthMetric;
  /** Existing goals on track. */
  hasPlan: HealthMetric;
  /** Mean of the known scores; null when none is known. */
  overall: number | null;
}

export type AdvisorSignal =
  | { kind: "upcoming_obligation"; label: string; amount: number | null; dueDate: string; daysLeft: number }
  | { kind: "cashflow_risk"; projectedEndOfMonth: number }
  | { kind: "spending_spike"; categoryId: string; label: string | null; current: number; previous: number; deltaPct: number }
  | { kind: "new_subscription"; label: string; monthlyAmount: number; categoryId: string }
  | { kind: "idle_cash"; amount: number; basis: "above_3_months_expense" }
  | { kind: "goal_progress"; goalId: string; name: string; state: GoalProgressState; percent: number };

export interface AdvisorJar {
  id: string;
  label: string;
  limit: number | null;
  spent: number;
  balance: number | null;
  spendable: number | null;
}

export interface AdvisorGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  monthlyContribution: number | null;
  state: GoalProgressState;
  percent: number;
}

export interface AdvisorContext {
  cif: string;
  /** "YYYY-MM" of the month `now` falls in; `months` are the complete months before it. */
  asOfMonth: string;
  months: AdvisorMonth[];
  avgIncome: Amount;
  avgExpense: Amount;
  /** Mean (income - expense) over months with data; sign kept. */
  surplus: Amount;
  monthsUsed: number;
  fixedExpense: Amount;
  flexExpense: Amount;
  topCategories: Array<CategoryAverage & { fixed: boolean }>;
  /** Non-fixed categories with an average > 0 (what the cut lever may use). */
  cuttable: CategoryAverage[];
  balances: { current: number | null; savings: number | null; creditCardDebt: number | null };
  jars: AdvisorJar[];
  existingGoals: AdvisorGoal[];
  runwayDays: Amount;
  health: AdvisorHealth;
  signals: AdvisorSignal[];
  dataQuality: { monthsUsed: number; unknown: string[]; source: "mock" };
}
