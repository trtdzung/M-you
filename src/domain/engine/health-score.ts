/**
 * Pure Financial Health Score (Bảng 2) calculation engine.
 *
 * Implements deterministic score mapping, honest null/missing-data semantics,
 * and pillar-balanced aggregation per docs/insights_reframe_docs/02_TARGET_CONTRACTS.md.
 * Pure functions only: no React, Providers, SQLite, network, or LLM.
 */

import type { Account, Goal, Liability } from "@/domain/models";
import type { CashflowResult } from "./cashflow";
import type { NetWorthResult } from "./networth";
import { cashRunwayMonths } from "./projection";
import {
  HEALTH_SCORE_POLICY_V0,
  type FinancialHealthScoreResult,
  type HealthMetricFact,
  type HealthMetricId,
  type HealthPillar,
  type HealthScorePolicy,
  type HealthTier,
} from "@/domain/models/health-score";

export interface HealthScoreInput {
  cashflow: CashflowResult;
  /** Multi-month cashflow history (e.g. 3-6 months) for multi-period metrics */
  monthlyCashflows?: Array<{ month: string; income: number; expense: number }>;
  accounts: Account[];
  networth: NetWorthResult;
  liabilities: Liability[];
  /** Must be affirmatively true to treat 0 liabilities as 0 debt service */
  liabilitiesConfirmedComplete?: boolean;
  goals: Goal[];
  /** Explicit self-reported or product record of insurance coverage */
  insuranceConfirmed?: boolean | null;
  /** Explicit trusted payment timeliness ratio in [0, 100], if verified */
  paymentTimelinessScore?: number | null;
  /** Explicit credit bureau score in [0, 100], if verified */
  creditBehaviorScore?: number | null;
  now?: Date;
  asOf?: string;
}

const PILLAR_METRICS: Record<HealthPillar, HealthMetricId[]> = {
  SPEND: ["SPENDING_TO_INCOME", "PAYMENT_TIMELINESS"],
  SAVE: ["CASH_RUNWAY", "SAVINGS_RATE"],
  BORROW: ["DEBT_SERVICE_RATIO", "CREDIT_BEHAVIOR"],
  PLAN_PROTECT: ["GOAL_PROGRESS", "INSURANCE_COVERAGE"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo1Decimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Maps raw metric values to normalized scores [0, 100].
 * Returns null if the value is missing, invalid, or non-computable.
 */
export function mapMetricScore(
  id: HealthMetricId,
  rawValue: number | boolean | null,
  policy: HealthScorePolicy = HEALTH_SCORE_POLICY_V0,
): number | null {
  if (rawValue === null || rawValue === undefined) return null;

  switch (id) {
    case "SPENDING_TO_INCOME": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
        return null;
      }
      const { healthyMax, copingMid, vulnerableMax } = policy.thresholds.spendingToIncome;
      if (rawValue <= healthyMax) return 100;
      if (rawValue <= copingMid) {
        // Linearly interpolate (0.7, 100) -> (1.0, 50)
        const ratio = (rawValue - healthyMax) / (copingMid - healthyMax);
        return clamp(roundTo1Decimal(100 - ratio * 50), 0, 100);
      }
      if (rawValue <= vulnerableMax) {
        // Linearly interpolate (1.0, 50) -> (1.3, 0)
        const ratio = (rawValue - copingMid) / (vulnerableMax - copingMid);
        return clamp(roundTo1Decimal(50 - ratio * 50), 0, 100);
      }
      return 0;
    }

    case "PAYMENT_TIMELINESS": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
        return null;
      }
      return clamp(roundTo1Decimal(rawValue), 0, 100);
    }

    case "CASH_RUNWAY": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }
      if (rawValue <= 0) return 0;
      const { tier1Months, tier1Score, tier2Months, tier2Score, tier3Months, tier3Score } =
        policy.thresholds.cashRunway;

      if (rawValue <= tier1Months) {
        // (0, 0) -> (1, 30)
        return clamp(roundTo1Decimal((rawValue / tier1Months) * tier1Score), 0, 100);
      }
      if (rawValue <= tier2Months) {
        // (1, 30) -> (3, 75)
        const ratio = (rawValue - tier1Months) / (tier2Months - tier1Months);
        return clamp(roundTo1Decimal(tier1Score + ratio * (tier2Score - tier1Score)), 0, 100);
      }
      if (rawValue <= tier3Months) {
        // (3, 75) -> (6, 100)
        const ratio = (rawValue - tier2Months) / (tier3Months - tier2Months);
        return clamp(roundTo1Decimal(tier2Score + ratio * (tier3Score - tier2Score)), 0, 100);
      }
      return 100;
    }

    case "SAVINGS_RATE": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }
      if (rawValue <= 0) return 0;
      const { lowThreshold, lowSlope, midThreshold, midBase, midSlope } =
        policy.thresholds.savingsRate;

      if (rawValue < lowThreshold) {
        // 0 < s < 0.1 -> 700 * s
        return clamp(roundTo1Decimal(rawValue * lowSlope), 0, 100);
      }
      if (rawValue < midThreshold) {
        // 0.1 <= s < 0.2 -> 70 + 300 * (s - 0.1)
        return clamp(roundTo1Decimal(midBase + (rawValue - lowThreshold) * midSlope), 0, 100);
      }
      return 100;
    }

    case "DEBT_SERVICE_RATIO": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
        return null;
      }
      const { healthyMax, vulnerableMax } = policy.thresholds.debtServiceRatio;
      if (rawValue === 0) return 100;
      if (rawValue <= healthyMax) {
        // 0 < d <= 0.30 -> interpolate 100 -> 70
        const ratio = rawValue / healthyMax;
        return clamp(roundTo1Decimal(100 - ratio * 30), 0, 100);
      }
      if (rawValue <= vulnerableMax) {
        // 0.30 < d <= 0.45 -> interpolate 70 -> 0
        const ratio = (rawValue - healthyMax) / (vulnerableMax - healthyMax);
        return clamp(roundTo1Decimal(70 - ratio * 70), 0, 100);
      }
      return 0;
    }

    case "CREDIT_BEHAVIOR": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
        return null;
      }
      return clamp(roundTo1Decimal(rawValue), 0, 100);
    }

    case "GOAL_PROGRESS": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
        return null;
      }
      return clamp(roundTo1Decimal(rawValue), 0, 100);
    }

    case "INSURANCE_COVERAGE": {
      if (typeof rawValue !== "boolean") return null;
      return rawValue ? 100 : 0;
    }

    default:
      return null;
  }
}

/**
 * Derives the 8 standard metric facts from available domain inputs.
 * Missing or unconfirmed data produces honest null scores with human-readable reasons.
 */
export function deriveHealthMetricFacts(
  input: HealthScoreInput,
  policy: HealthScorePolicy = HEALTH_SCORE_POLICY_V0,
): HealthMetricFact[] {
  const asOf = input.asOf ?? (input.now ?? new Date()).toISOString();
  const currentMonth = asOf.slice(0, 7);

  // 1. SPEND: SPENDING_TO_INCOME
  let spendingToIncomeRatio: number | null = null;
  let spendingToIncomeReason: string | undefined;
  let spendingToIncomePeriod: string | null = null;

  const validIncomeMonths = (input.monthlyCashflows ?? []).filter((m) => m.income > 0);
  if (validIncomeMonths.length >= policy.thresholds.spendingToIncome.minIncomeMonths) {
    const totalIncome = validIncomeMonths.reduce((s, m) => s + m.income, 0);
    const totalExpense = validIncomeMonths.reduce((s, m) => s + m.expense, 0);
    if (totalIncome > 0) {
      spendingToIncomeRatio = totalExpense / totalIncome;
      spendingToIncomePeriod = `${validIncomeMonths.length}_months_window`;
    } else {
      spendingToIncomeReason = "Tổng thu nhập trong kỳ quan sát bằng 0";
    }
  } else if (input.cashflow.income > 0) {
    spendingToIncomeReason = "Cần ít nhất 2 tháng ghi nhận thu nhập để đánh giá tỷ lệ chi tiêu";
  } else {
    spendingToIncomeReason = "Chưa có dữ liệu thu nhập được ghi nhận";
  }

  const spendingToIncomeScore = mapMetricScore(
    "SPENDING_TO_INCOME",
    spendingToIncomeRatio,
    policy,
  );

  const spendingToIncomeFact: HealthMetricFact = {
    id: "SPENDING_TO_INCOME",
    pillar: "SPEND",
    rawValue: spendingToIncomeRatio !== null ? roundTo1Decimal(spendingToIncomeRatio * 100) / 100 : null,
    rawUnit: "ratio",
    score: spendingToIncomeScore,
    weight: policy.baselineMetricWeight,
    source: "derived",
    period: spendingToIncomePeriod,
    asOf,
    reasonUnavailable: spendingToIncomeScore === null ? spendingToIncomeReason : undefined,
    assumptions: ["Chi tiêu và thu nhập tính trên các giao dịch hợp lệ đã quyết toán (posted)."],
  };

  // 2. SPEND: PAYMENT_TIMELINESS
  const paymentTimelinessScore = mapMetricScore(
    "PAYMENT_TIMELINESS",
    input.paymentTimelinessScore ?? null,
    policy,
  );
  const paymentTimelinessFact: HealthMetricFact = {
    id: "PAYMENT_TIMELINESS",
    pillar: "SPEND",
    rawValue: input.paymentTimelinessScore ?? null,
    rawUnit: "score_0_100",
    score: paymentTimelinessScore,
    weight: policy.baselineMetricWeight,
    source: input.paymentTimelinessScore != null ? "msb" : "derived",
    period: currentMonth,
    asOf,
    reasonUnavailable:
      paymentTimelinessScore === null
        ? "Chưa có nguồn xác thực lịch sử và thời điểm thanh toán nghĩa vụ nợ"
        : undefined,
    assumptions: ["Chỉ tính khi có liên kết giữa nghĩa vụ đến hạn và thời điểm trả thực tế."],
  };

  // 3. SAVE: CASH_RUNWAY
  const runway = cashRunwayMonths(input.accounts, input.cashflow.expense);
  const runwayScore = mapMetricScore("CASH_RUNWAY", runway.months, policy);
  const cashRunwayFact: HealthMetricFact = {
    id: "CASH_RUNWAY",
    pillar: "SAVE",
    rawValue: runway.months !== null ? roundTo1Decimal(runway.months) : null,
    rawUnit: "months",
    score: runwayScore,
    weight: policy.baselineMetricWeight,
    source: "estimated",
    period: currentMonth,
    asOf,
    reasonUnavailable:
      runwayScore === null
        ? "Chi tiêu bằng 0 hoặc chưa có đủ số dư tài khoản thanh toán để tính dự phòng"
        : undefined,
    assumptions: ["Dựa trên số dư khả dụng hiện tại chia cho mức chi tiêu tháng."],
  };

  // 4. SAVE: SAVINGS_RATE
  let savingsRate: number | null = null;
  let savingsRateReason: string | undefined;
  let savingsRatePeriod: string | null = null;

  if (validIncomeMonths.length >= policy.thresholds.spendingToIncome.minIncomeMonths) {
    const totalIncome = validIncomeMonths.reduce((s, m) => s + m.income, 0);
    const totalExpense = validIncomeMonths.reduce((s, m) => s + m.expense, 0);
    if (totalIncome > 0) {
      const netAccumulation = totalIncome - totalExpense;
      savingsRate = Math.max(0, netAccumulation) / totalIncome;
      savingsRatePeriod = `${validIncomeMonths.length}_months_window`;
    }
  } else if (input.cashflow.income > 0) {
    const net = input.cashflow.income - input.cashflow.expense;
    savingsRate = Math.max(0, net) / input.cashflow.income;
    savingsRatePeriod = currentMonth;
  } else {
    savingsRateReason = "Chưa có dữ liệu thu nhập để tính tỷ lệ tích lũy/tiết kiệm";
  }

  const savingsRateScore = mapMetricScore("SAVINGS_RATE", savingsRate, policy);
  const savingsRateFact: HealthMetricFact = {
    id: "SAVINGS_RATE",
    pillar: "SAVE",
    rawValue: savingsRate !== null ? roundTo1Decimal(savingsRate * 100) / 100 : null,
    rawUnit: "ratio",
    score: savingsRateScore,
    weight: policy.baselineMetricWeight,
    source: "derived",
    period: savingsRatePeriod,
    asOf,
    reasonUnavailable: savingsRateScore === null ? savingsRateReason : undefined,
    assumptions: ["Tích lũy tính từ chênh lệch thu nhập trừ chi phí thực tế, loại trừ chuyển khoản nội bộ."],
  };

  // 5. BORROW: DEBT_SERVICE_RATIO
  let debtServiceRatio: number | null = null;
  let debtServiceReason: string | undefined;

  const avgMonthlyIncome =
    validIncomeMonths.length > 0
      ? validIncomeMonths.reduce((s, m) => s + m.income, 0) / validIncomeMonths.length
      : input.cashflow.income;

  if (input.liabilities.length === 0) {
    if (input.liabilitiesConfirmedComplete === true) {
      debtServiceRatio = 0;
    } else {
      debtServiceReason = "Hồ sơ khoản nợ chưa được xác nhận hoàn tất";
    }
  } else {
    const allKnown = input.liabilities.every(
      (l) => l.minimumPayment !== null && Number.isFinite(l.minimumPayment) && l.minimumPayment >= 0,
    );
    if (!allKnown) {
      debtServiceReason = "Có khoản nợ chưa rõ nghĩa vụ thanh toán định kỳ tối thiểu";
    } else if (avgMonthlyIncome <= 0) {
      debtServiceReason = "Chưa ghi nhận thu nhập để đối chiếu nghĩa vụ nợ";
    } else {
      const totalMonthlyDebtService = input.liabilities.reduce(
        (sum, l) => sum + (l.minimumPayment ?? 0),
        0,
      );
      debtServiceRatio = totalMonthlyDebtService / avgMonthlyIncome;
    }
  }

  const debtServiceScore = mapMetricScore("DEBT_SERVICE_RATIO", debtServiceRatio, policy);
  const debtServiceFact: HealthMetricFact = {
    id: "DEBT_SERVICE_RATIO",
    pillar: "BORROW",
    rawValue: debtServiceRatio !== null ? roundTo1Decimal(debtServiceRatio * 100) / 100 : null,
    rawUnit: "ratio",
    score: debtServiceScore,
    weight: policy.baselineMetricWeight,
    source: input.liabilities.some((l) => l.source === "self_reported") ? "self_reported" : "derived",
    period: currentMonth,
    asOf,
    reasonUnavailable: debtServiceScore === null ? debtServiceReason : undefined,
    assumptions: ["Sử dụng nghĩa vụ trả tối thiểu đã ghi nhận trên thu nhập trung bình hàng tháng."],
  };

  // 6. BORROW: CREDIT_BEHAVIOR
  const creditBehaviorScore = mapMetricScore(
    "CREDIT_BEHAVIOR",
    input.creditBehaviorScore ?? null,
    policy,
  );
  const creditBehaviorFact: HealthMetricFact = {
    id: "CREDIT_BEHAVIOR",
    pillar: "BORROW",
    rawValue: input.creditBehaviorScore ?? null,
    rawUnit: "score_0_100",
    score: creditBehaviorScore,
    weight: policy.baselineMetricWeight,
    source: input.creditBehaviorScore != null ? "msb" : "derived",
    period: currentMonth,
    asOf,
    reasonUnavailable:
      creditBehaviorScore === null ? "Chưa tích hợp dữ liệu trung tâm thông tin tín dụng" : undefined,
    assumptions: ["Không tự suy diễn điểm tín dụng khi chưa có nguồn dữ liệu được cấp phép."],
  };

  // 7. PLAN_PROTECT: GOAL_PROGRESS
  let goalProgressScore: number | null = null;
  let goalProgressReason: string | undefined;

  const validGoals = input.goals.filter(
    (g) => typeof g.targetAmount === "number" && g.targetAmount > 0,
  );
  if (validGoals.length > 0) {
    const totalRatio = validGoals.reduce(
      (sum, g) => sum + clamp(g.currentAmount / g.targetAmount, 0, 1),
      0,
    );
    goalProgressScore = clamp(roundTo1Decimal((totalRatio / validGoals.length) * 100), 0, 100);
  } else {
    goalProgressReason = "Chưa có mục tiêu tài chính nào có hạn mức mục tiêu dương";
  }

  const goalProgressFact: HealthMetricFact = {
    id: "GOAL_PROGRESS",
    pillar: "PLAN_PROTECT",
    rawValue: goalProgressScore,
    rawUnit: "score_0_100",
    score: goalProgressScore,
    weight: policy.baselineMetricWeight,
    source: "derived",
    period: currentMonth,
    asOf,
    reasonUnavailable: goalProgressScore === null ? goalProgressReason : undefined,
    assumptions: ["Đo lường tỷ lệ hoàn thành số tiền mục tiêu hiện tại, chưa tính tiến độ theo thời gian."],
  };

  // 8. PLAN_PROTECT: INSURANCE_COVERAGE
  const insuranceScore = mapMetricScore(
    "INSURANCE_COVERAGE",
    input.insuranceConfirmed ?? null,
    policy,
  );
  const insuranceFact: HealthMetricFact = {
    id: "INSURANCE_COVERAGE",
    pillar: "PLAN_PROTECT",
    rawValue: input.insuranceConfirmed ?? null,
    rawUnit: "boolean",
    score: insuranceScore,
    weight: policy.baselineMetricWeight,
    source: input.insuranceConfirmed != null ? "self_reported" : "derived",
    period: currentMonth,
    asOf,
    reasonUnavailable:
      insuranceScore === null ? "Chưa có thông tin xác nhận hợp đồng bảo hiểm" : undefined,
    assumptions: ["Sự vắng mặt của giao dịch phí không được coi là không có bảo hiểm."],
  };

  return [
    spendingToIncomeFact,
    paymentTimelinessFact,
    cashRunwayFact,
    savingsRateFact,
    debtServiceFact,
    creditBehaviorFact,
    goalProgressFact,
    insuranceFact,
  ];
}

/**
 * Aggregates metric facts into pillar scores and overall financial health score.
 * Pure aggregation: respects minimum pillar/metric thresholds and honest nulls.
 */
export function scoreFinancialHealth(
  metrics: HealthMetricFact[],
  policy: HealthScorePolicy = HEALTH_SCORE_POLICY_V0,
  computedAt: string = new Date().toISOString(),
): FinancialHealthScoreResult {
  const metricMap = new Map(metrics.map((m) => [m.id, m]));

  const pillarScores: Record<HealthPillar, number | null> = {
    SPEND: null,
    SAVE: null,
    BORROW: null,
    PLAN_PROTECT: null,
  };

  const availablePillars: HealthPillar[] = [];
  let computableMetricCount = 0;
  let totalComputableWeight = 0;

  for (const [pillar, metricIds] of Object.entries(PILLAR_METRICS) as Array<
    [HealthPillar, HealthMetricId[]]
  >) {
    const scores = metricIds
      .map((id) => metricMap.get(id))
      .filter((m): m is HealthMetricFact => m !== undefined && m.score !== null && Number.isFinite(m.score))
      .map((m) => m.score as number);

    if (scores.length > 0) {
      const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      pillarScores[pillar] = clamp(roundTo1Decimal(avg), 0, 100);
      availablePillars.push(pillar);
    }

    // Weight and metric count tracking
    for (const id of metricIds) {
      const m = metricMap.get(id);
      if (m && m.score !== null && Number.isFinite(m.score)) {
        computableMetricCount++;
        totalComputableWeight += m.weight;
      }
    }
  }

  // Score coverage is the raw sum of configured weights (0..1)
  const scoreCoverage = roundTo1Decimal(clamp(totalComputableWeight, 0, 1) * 100) / 100;

  // Check minimum visibility threshold: >= 3/4 pillars and >= 5/8 metrics
  const hasMinPillars = availablePillars.length >= policy.minRequiredPillars;
  const hasMinMetrics = computableMetricCount >= policy.minRequiredMetrics;

  let overallScore: number | null = null;
  let tier: HealthTier | null = null;

  if (hasMinPillars && hasMinMetrics && availablePillars.length > 0) {
    const pillarSum = availablePillars.reduce(
      (sum, p) => sum + (pillarScores[p] ?? 0),
      0,
    );
    // Average equally across available pillars to avoid pillar imbalance
    overallScore = clamp(Math.round(pillarSum / availablePillars.length), 0, 100);

    if (overallScore >= policy.tierCutoffs.healthy) {
      tier = "healthy";
    } else if (overallScore >= policy.tierCutoffs.coping) {
      tier = "coping";
    } else {
      tier = "vulnerable";
    }
  }

  return {
    policyVersion: policy.version,
    overallScore,
    tier,
    scoreCoverage,
    availablePillars,
    metrics,
    pillarScores,
    computedAt,
  };
}

/**
 * Convenience helper to compute health score from domain inputs in one step.
 */
export function computeFinancialHealthScore(
  input: HealthScoreInput,
  policy: HealthScorePolicy = HEALTH_SCORE_POLICY_V0,
): FinancialHealthScoreResult {
  const facts = deriveHealthMetricFacts(input, policy);
  return scoreFinancialHealth(facts, policy, input.asOf ?? (input.now ?? new Date()).toISOString());
}
