import type { GoalFlexibility } from "../model/types";

export type Verdict = "feasible" | "stretch" | "not_feasible" | "unknown";
export type PlanId = "keep_deadline" | "extend_deadline" | "reduce_amount";

export interface AnalyzeDraft {
  name: string;
  targetAmount: number;
  /** "YYYY-MM-DD". */
  targetDate: string;
  flexibility: GoalFlexibility;
  openingAmount: number;
}

export interface PlanCut {
  categoryId: string;
  label: string | null;
  perMonth: number;
  /** Where the number comes from: a spike signal, a new subscription, or a share of the category average. */
  reason: "spike" | "subscription" | "category";
}

export interface PlanFunding {
  jarId: string;
  label: string;
  amount: number;
}

export interface SeriesPoint {
  monthKey: string;
  amount: number;
}

export interface Plan {
  id: PlanId;
  /** false = not offered (fixed goal, no surplus, ...); `reason` says why. */
  available: boolean;
  reason: "fixed_goal" | "no_surplus" | "unknown_surplus" | "already_enough" | null;
  /** false = the goal already fits comfortably, the plan changes nothing. */
  needed: boolean;
  months: number;
  monthly: number;
  targetDate: string;
  targetAmount: number;
  cuts: PlanCut[];
  /** True when cuts cover whatever the surplus does not. */
  cutsCoverGap: boolean;
  fundingFromJars: PlanFunding[];
  /** Spare cash/savings (above 3 months of spending) put in up front. */
  fundingFromIdle: number;
  series: SeriesPoint[];
}

export type HealthKey = "spendRatio" | "steadySaving" | "hasPlan";

export interface HealthImpact {
  metric: HealthKey;
  from: 0 | 50 | 100;
  to: 0 | 50 | 100;
}

export type Caution =
  | { kind: "obligation_due"; label: string; amount: number | null; daysLeft: number }
  | { kind: "month_end_shortfall"; projected: number }
  | { kind: "tight_budget"; shareOfSurplus: number };

export interface PlanInsight {
  healthImpact: HealthImpact[];
  cautions: Caution[];
}

export interface Analysis {
  verdict: Verdict;
  requiredMonthly: number;
  monthsLeft: number;
  surplus: number | "unknown";
  /** requiredMonthly / surplus; null when surplus is unknown or not positive. */
  gapMultiple: number | null;
  plans: Record<PlanId, Plan>;
  /** Per plan: health bands that would change, and what to watch out for. */
  insights: Record<PlanId, PlanInsight>;
  provenance: { source: "mock"; monthsUsed: number; basis: "average_surplus" };
}
