// Financial-health indicators (business table 2). Pure; thresholds 100/50/0, unknown -> null.
import type { AdvisorGoal, AdvisorHealth, HealthMetric } from "./types";

const NONE: HealthMetric = { value: null, score: null };

function metric(value: number | null, score: (v: number) => 0 | 50 | 100): HealthMetric {
  return value === null || !Number.isFinite(value) ? NONE : { value, score: score(value) };
}

export interface HealthInput {
  /** Sums over the last 3 months with data. */
  income3: number;
  expense3: number;
  monthsUsed3: number;
  casa: number | null;
  savings: number | null;
  /** Average monthly fixed (essential) expense; null when unknown. */
  essentialMonthly: number | null;
  /** Σ transfers into savings over the same months; null when no savings account. */
  savingsTransfers3: number | null;
  /** Σ card payments over the same months; null when no credit card. */
  cardPayments3: number | null;
  goals: AdvisorGoal[];
}

export function computeHealth(i: HealthInput): AdvisorHealth {
  const hasIncome = i.monthsUsed3 > 0 && i.income3 > 0;
  const spendRatio = metric(hasIncome ? i.expense3 / i.income3 : null, (v) => (v < 0.8 ? 100 : v <= 1 ? 50 : 0));

  const liquid = i.casa === null ? null : i.casa + (i.savings ?? 0);
  const efMonths = liquid !== null && i.essentialMonthly !== null && i.essentialMonthly > 0 ? liquid / i.essentialMonthly : null;
  const emergencyFund = metric(efMonths, (v) => (v >= 3 ? 100 : v >= 1 ? 50 : 0));

  const steadySaving = metric(hasIncome && i.savingsTransfers3 !== null ? i.savingsTransfers3 / i.income3 : null, (v) =>
    v >= 0.1 ? 100 : v > 0 ? 50 : 0,
  );
  const debtToIncome = metric(hasIncome && i.cardPayments3 !== null ? i.cardPayments3 / i.income3 : null, (v) =>
    v < 0.3 ? 100 : v <= 0.4 ? 50 : 0,
  );

  const behind = i.goals.some((g) => g.state === "slightly_behind" || g.state === "off_track");
  const hasPlan: HealthMetric = {
    value: i.goals.length,
    score: i.goals.length === 0 ? 0 : behind ? 50 : 100,
  };

  const parts = { spendRatio, onTimePayment: NONE, emergencyFund, steadySaving, debtToIncome, hasPlan };
  const scores: number[] = Object.values(parts).flatMap((m) => (m.score === null ? [] : [m.score]));
  const overall = scores.length === 0 ? null : Math.round(scores.reduce<number>((a, b) => a + b, 0) / scores.length);
  return { ...parts, overall };
}
