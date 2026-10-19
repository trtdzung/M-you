import type { DataSource } from "./index";

export type HealthPillar = "SPEND" | "SAVE" | "BORROW" | "PLAN_PROTECT";

export type HealthMetricId =
  | "SPENDING_TO_INCOME"
  | "PAYMENT_TIMELINESS"
  | "CASH_RUNWAY"
  | "SAVINGS_RATE"
  | "DEBT_SERVICE_RATIO"
  | "CREDIT_BEHAVIOR"
  | "GOAL_PROGRESS"
  | "INSURANCE_COVERAGE";

export type HealthMetricUnit = "ratio" | "months" | "boolean" | "score_0_100";

export type HealthTier = "healthy" | "coping" | "vulnerable";

export interface HealthMetricFact {
  id: HealthMetricId;
  pillar: HealthPillar;
  rawValue: number | boolean | null;
  rawUnit: HealthMetricUnit;
  /** Normalized score in [0, 100], or null when not computable from trustworthy evidence. */
  score: number | null;
  /** Baseline configured weight in overall index (0.125 in prototype v0 policy). */
  weight: number;
  source: DataSource | "derived";
  period: string | null;
  asOf: string | null;
  reasonUnavailable?: string;
  assumptions: string[];
}

export interface FinancialHealthScoreResult {
  policyVersion: string;
  overallScore: number | null;
  tier: HealthTier | null;
  /** Sum of baseline configured weights for computable metrics (0..1). Independent of renormalization. */
  scoreCoverage: number;
  availablePillars: HealthPillar[];
  metrics: HealthMetricFact[];
  pillarScores: Record<HealthPillar, number | null>;
  computedAt: string;
}

export interface HealthScorePolicy {
  version: string;
  baselineMetricWeight: number; // 0.125
  minRequiredPillars: number;   // 3
  minRequiredMetrics: number;   // 5
  tierCutoffs: {
    healthy: number;   // >= 80
    coping: number;    // >= 55
    vulnerable: number;// < 55
  };
  thresholds: {
    spendingToIncome: {
      healthyMax: number;   // 0.7 -> 100
      copingMid: number;     // 1.0 -> 50
      vulnerableMax: number;// 1.3 -> 0
      minIncomeMonths: number; // 2
    };
    cashRunway: {
      tier1Months: number; // 1 month -> 30
      tier1Score: number;
      tier2Months: number; // 3 months -> 75
      tier2Score: number;
      tier3Months: number; // 6 months -> 100
      tier3Score: number;
    };
    savingsRate: {
      lowThreshold: number; // 0.1
      lowSlope: number;     // 700 (0.1 -> 70)
      midThreshold: number; // 0.2
      midBase: number;      // 70
      midSlope: number;     // 300 (0.2 -> 100)
    };
    debtServiceRatio: {
      healthyMax: number;   // 0.30 (100 -> 70)
      vulnerableMax: number;// 0.45 (70 -> 0)
    };
  };
}

export const HEALTH_SCORE_POLICY_V0: HealthScorePolicy = {
  version: "pfm-health-v0",
  baselineMetricWeight: 0.125,
  minRequiredPillars: 3,
  minRequiredMetrics: 5,
  tierCutoffs: {
    healthy: 80,
    coping: 55,
    vulnerable: 0,
  },
  thresholds: {
    spendingToIncome: {
      healthyMax: 0.7,
      copingMid: 1.0,
      vulnerableMax: 1.3,
      minIncomeMonths: 2,
    },
    cashRunway: {
      tier1Months: 1,
      tier1Score: 30,
      tier2Months: 3,
      tier2Score: 75,
      tier3Months: 6,
      tier3Score: 100,
    },
    savingsRate: {
      lowThreshold: 0.1,
      lowSlope: 700,
      midThreshold: 0.2,
      midBase: 70,
      midSlope: 300,
    },
    debtServiceRatio: {
      healthyMax: 0.30,
      vulnerableMax: 0.45,
    },
  },
} as const;
