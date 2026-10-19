import { describe, expect, it } from "vitest";
import {
  mapMetricScore,
  deriveHealthMetricFacts,
  scoreFinancialHealth,
  computeFinancialHealthScore,
} from "../health-score";
import {
  HEALTH_SCORE_POLICY_V0,
  type HealthMetricFact,
} from "@/domain/models/health-score";
import type { Account, Goal, Liability } from "@/domain/models";
import type { CashflowResult } from "../cashflow";
import type { NetWorthResult } from "../networth";

describe("Financial Health Score (Bảng 2)", () => {
  describe("mapMetricScore - exact thresholds and boundaries", () => {
    describe("SPENDING_TO_INCOME", () => {
      it("returns 100 for ratios <= 0.7", () => {
        expect(mapMetricScore("SPENDING_TO_INCOME", 0)).toBe(100);
        expect(mapMetricScore("SPENDING_TO_INCOME", 0.5)).toBe(100);
        expect(mapMetricScore("SPENDING_TO_INCOME", 0.7)).toBe(100);
      });

      it("interpolates linearly between 0.7 (100) and 1.0 (50)", () => {
        // mid-point at 0.85 -> 75
        expect(mapMetricScore("SPENDING_TO_INCOME", 0.85)).toBe(75);
        expect(mapMetricScore("SPENDING_TO_INCOME", 1.0)).toBe(50);
      });

      it("interpolates linearly between 1.0 (50) and 1.3 (0)", () => {
        // mid-point at 1.15 -> 25
        expect(mapMetricScore("SPENDING_TO_INCOME", 1.15)).toBe(25);
        expect(mapMetricScore("SPENDING_TO_INCOME", 1.3)).toBe(0);
      });

      it("returns 0 for ratios > 1.3", () => {
        expect(mapMetricScore("SPENDING_TO_INCOME", 1.31)).toBe(0);
        expect(mapMetricScore("SPENDING_TO_INCOME", 2.5)).toBe(0);
      });

      it("returns null for negative, null, NaN, or non-finite inputs", () => {
        expect(mapMetricScore("SPENDING_TO_INCOME", null)).toBeNull();
        expect(mapMetricScore("SPENDING_TO_INCOME", -0.1)).toBeNull();
        expect(mapMetricScore("SPENDING_TO_INCOME", NaN)).toBeNull();
        expect(mapMetricScore("SPENDING_TO_INCOME", Infinity)).toBeNull();
      });
    });

    describe("CASH_RUNWAY", () => {
      it("returns 0 for runway <= 0", () => {
        expect(mapMetricScore("CASH_RUNWAY", 0)).toBe(0);
        expect(mapMetricScore("CASH_RUNWAY", -1)).toBe(0);
      });

      it("interpolates piecewise (0,0) -> (1,30)", () => {
        expect(mapMetricScore("CASH_RUNWAY", 0.5)).toBe(15);
        expect(mapMetricScore("CASH_RUNWAY", 1.0)).toBe(30);
      });

      it("interpolates piecewise (1,30) -> (3,75)", () => {
        expect(mapMetricScore("CASH_RUNWAY", 2.0)).toBe(52.5);
        expect(mapMetricScore("CASH_RUNWAY", 3.0)).toBe(75);
      });

      it("interpolates piecewise (3,75) -> (6,100)", () => {
        expect(mapMetricScore("CASH_RUNWAY", 4.5)).toBe(87.5);
        expect(mapMetricScore("CASH_RUNWAY", 6.0)).toBe(100);
      });

      it("caps at 100 for runway > 6", () => {
        expect(mapMetricScore("CASH_RUNWAY", 6.1)).toBe(100);
        expect(mapMetricScore("CASH_RUNWAY", 12)).toBe(100);
      });

      it("returns null for non-finite / null inputs", () => {
        expect(mapMetricScore("CASH_RUNWAY", null)).toBeNull();
        expect(mapMetricScore("CASH_RUNWAY", NaN)).toBeNull();
        expect(mapMetricScore("CASH_RUNWAY", Infinity)).toBeNull();
      });
    });

    describe("SAVINGS_RATE", () => {
      it("returns 0 for savings rate <= 0", () => {
        expect(mapMetricScore("SAVINGS_RATE", 0)).toBe(0);
        expect(mapMetricScore("SAVINGS_RATE", -0.05)).toBe(0);
      });

      it("applies slope 700 for 0 < s < 0.1", () => {
        expect(mapMetricScore("SAVINGS_RATE", 0.05)).toBe(35);
        expect(mapMetricScore("SAVINGS_RATE", 0.09)).toBe(63);
      });

      it("applies 70 + 300(s - 0.1) for 0.1 <= s < 0.2", () => {
        expect(mapMetricScore("SAVINGS_RATE", 0.1)).toBe(70);
        expect(mapMetricScore("SAVINGS_RATE", 0.15)).toBe(85);
        expect(mapMetricScore("SAVINGS_RATE", 0.19)).toBe(97);
      });

      it("returns 100 for s >= 0.2", () => {
        expect(mapMetricScore("SAVINGS_RATE", 0.2)).toBe(100);
        expect(mapMetricScore("SAVINGS_RATE", 0.5)).toBe(100);
      });

      it("returns null for invalid / null inputs", () => {
        expect(mapMetricScore("SAVINGS_RATE", null)).toBeNull();
        expect(mapMetricScore("SAVINGS_RATE", NaN)).toBeNull();
        expect(mapMetricScore("SAVINGS_RATE", Infinity)).toBeNull();
      });
    });

    describe("DEBT_SERVICE_RATIO", () => {
      it("returns 100 for d = 0", () => {
        expect(mapMetricScore("DEBT_SERVICE_RATIO", 0)).toBe(100);
      });

      it("interpolates (0, 100) -> (0.30, 70)", () => {
        expect(mapMetricScore("DEBT_SERVICE_RATIO", 0.15)).toBe(85);
        expect(mapMetricScore("DEBT_SERVICE_RATIO", 0.30)).toBe(70);
      });

      it("interpolates (0.30, 70) -> (0.45, 0)", () => {
        expect(mapMetricScore("DEBT_SERVICE_RATIO", 0.375)).toBe(35);
        expect(mapMetricScore("DEBT_SERVICE_RATIO", 0.45)).toBe(0);
      });

      it("returns 0 for d > 0.45", () => {
        expect(mapMetricScore("DEBT_SERVICE_RATIO", 0.50)).toBe(0);
      });

      it("returns null for negative, null, NaN or non-finite inputs", () => {
        expect(mapMetricScore("DEBT_SERVICE_RATIO", null)).toBeNull();
        expect(mapMetricScore("DEBT_SERVICE_RATIO", -0.1)).toBeNull();
        expect(mapMetricScore("DEBT_SERVICE_RATIO", NaN)).toBeNull();
        expect(mapMetricScore("DEBT_SERVICE_RATIO", Infinity)).toBeNull();
      });
    });

    describe("INSURANCE_COVERAGE", () => {
      it("returns 100 for true, 0 for false, null for null/undefined", () => {
        expect(mapMetricScore("INSURANCE_COVERAGE", true)).toBe(100);
        expect(mapMetricScore("INSURANCE_COVERAGE", false)).toBe(0);
        expect(mapMetricScore("INSURANCE_COVERAGE", null)).toBeNull();
      });
    });
  });

  describe("scoreFinancialHealth - Aggregation & Visibility Gates", () => {
    function makeFact(
      id: HealthMetricFact["id"],
      pillar: HealthMetricFact["pillar"],
      score: number | null,
    ): HealthMetricFact {
      return {
        id,
        pillar,
        rawValue: score,
        rawUnit: "score_0_100",
        score,
        weight: 0.125,
        source: "derived",
        period: "2026-09",
        asOf: "2026-09-15T00:00:00Z",
        assumptions: [],
      };
    }

    it("returns overallScore: null and tier: null when all inputs are missing", () => {
      const allNullFacts: HealthMetricFact[] = [
        makeFact("SPENDING_TO_INCOME", "SPEND", null),
        makeFact("PAYMENT_TIMELINESS", "SPEND", null),
        makeFact("CASH_RUNWAY", "SAVE", null),
        makeFact("SAVINGS_RATE", "SAVE", null),
        makeFact("DEBT_SERVICE_RATIO", "BORROW", null),
        makeFact("CREDIT_BEHAVIOR", "BORROW", null),
        makeFact("GOAL_PROGRESS", "PLAN_PROTECT", null),
        makeFact("INSURANCE_COVERAGE", "PLAN_PROTECT", null),
      ];

      const res = scoreFinancialHealth(allNullFacts);
      expect(res.overallScore).toBeNull();
      expect(res.tier).toBeNull();
      expect(res.scoreCoverage).toBe(0);
      expect(res.availablePillars).toHaveLength(0);
      expect(res.pillarScores.SPEND).toBeNull();
      expect(res.pillarScores.SAVE).toBeNull();
      expect(res.pillarScores.BORROW).toBeNull();
      expect(res.pillarScores.PLAN_PROTECT).toBeNull();
    });

    it("requires at least 3 pillars AND at least 5 metrics to display overallScore", () => {
      // 4 metrics available across only 2 pillars (SPEND, SAVE) -> insufficient pillars (< 3)
      const fourMetricsTwoPillars: HealthMetricFact[] = [
        makeFact("SPENDING_TO_INCOME", "SPEND", 80),
        makeFact("PAYMENT_TIMELINESS", "SPEND", 90),
        makeFact("CASH_RUNWAY", "SAVE", 85),
        makeFact("SAVINGS_RATE", "SAVE", 75),
        makeFact("DEBT_SERVICE_RATIO", "BORROW", null),
        makeFact("CREDIT_BEHAVIOR", "BORROW", null),
        makeFact("GOAL_PROGRESS", "PLAN_PROTECT", null),
        makeFact("INSURANCE_COVERAGE", "PLAN_PROTECT", null),
      ];

      const res1 = scoreFinancialHealth(fourMetricsTwoPillars);
      expect(res1.availablePillars).toHaveLength(2);
      expect(res1.scoreCoverage).toBe(0.5); // 4 * 0.125
      expect(res1.overallScore).toBeNull();
      expect(res1.tier).toBeNull();

      // 4 metrics across 3 pillars (SPEND 1, SAVE 2, BORROW 1) -> has 3 pillars but only 4 metrics (< 5)
      const fourMetricsThreePillars: HealthMetricFact[] = [
        makeFact("SPENDING_TO_INCOME", "SPEND", 80),
        makeFact("PAYMENT_TIMELINESS", "SPEND", null),
        makeFact("CASH_RUNWAY", "SAVE", 85),
        makeFact("SAVINGS_RATE", "SAVE", 75),
        makeFact("DEBT_SERVICE_RATIO", "BORROW", 90),
        makeFact("CREDIT_BEHAVIOR", "BORROW", null),
        makeFact("GOAL_PROGRESS", "PLAN_PROTECT", null),
        makeFact("INSURANCE_COVERAGE", "PLAN_PROTECT", null),
      ];

      const res2 = scoreFinancialHealth(fourMetricsThreePillars);
      expect(res2.availablePillars).toHaveLength(3);
      expect(res2.scoreCoverage).toBe(0.5); // 4 * 0.125
      expect(res2.overallScore).toBeNull(); // Still null because < 5 metrics

      // Exactly 5 metrics across 3 pillars -> GATES PASS!
      const fiveMetricsThreePillars: HealthMetricFact[] = [
        makeFact("SPENDING_TO_INCOME", "SPEND", 80),
        makeFact("PAYMENT_TIMELINESS", "SPEND", 90),
        makeFact("CASH_RUNWAY", "SAVE", 85),
        makeFact("SAVINGS_RATE", "SAVE", 75),
        makeFact("DEBT_SERVICE_RATIO", "BORROW", 70),
        makeFact("CREDIT_BEHAVIOR", "BORROW", null),
        makeFact("GOAL_PROGRESS", "PLAN_PROTECT", null),
        makeFact("INSURANCE_COVERAGE", "PLAN_PROTECT", null),
      ];

      const res3 = scoreFinancialHealth(fiveMetricsThreePillars);
      expect(res3.availablePillars).toEqual(["SPEND", "SAVE", "BORROW"]);
      expect(res3.scoreCoverage).toBe(0.625); // 5 * 0.125 = 0.625 exactly
      expect(res3.pillarScores.SPEND).toBe(85); // (80 + 90) / 2
      expect(res3.pillarScores.SAVE).toBe(80);  // (85 + 75) / 2
      expect(res3.pillarScores.BORROW).toBe(70);// 70
      // Average across 3 available pillars = (85 + 80 + 70) / 3 = 235 / 3 = 78.33 -> round 78
      expect(res3.overallScore).toBe(78);
      expect(res3.tier).toBe("coping"); // < 80 and >= 55
    });

    it("assigns healthy tier when overallScore >= 80", () => {
      const healthyFacts: HealthMetricFact[] = [
        makeFact("SPENDING_TO_INCOME", "SPEND", 100),
        makeFact("PAYMENT_TIMELINESS", "SPEND", 100),
        makeFact("CASH_RUNWAY", "SAVE", 90),
        makeFact("SAVINGS_RATE", "SAVE", 80),
        makeFact("DEBT_SERVICE_RATIO", "BORROW", 90),
        makeFact("CREDIT_BEHAVIOR", "BORROW", null),
        makeFact("GOAL_PROGRESS", "PLAN_PROTECT", 80),
        makeFact("INSURANCE_COVERAGE", "PLAN_PROTECT", 100),
      ];

      const res = scoreFinancialHealth(healthyFacts);
      expect(res.availablePillars).toHaveLength(4);
      expect(res.scoreCoverage).toBe(0.875); // 7 * 0.125 = 0.875
      expect(res.overallScore).toBeGreaterThanOrEqual(80);
      expect(res.tier).toBe("healthy");
    });

    it("assigns vulnerable tier when overallScore < 55", () => {
      const vulnerableFacts: HealthMetricFact[] = [
        makeFact("SPENDING_TO_INCOME", "SPEND", 30),
        makeFact("PAYMENT_TIMELINESS", "SPEND", 40),
        makeFact("CASH_RUNWAY", "SAVE", 20),
        makeFact("SAVINGS_RATE", "SAVE", 10),
        makeFact("DEBT_SERVICE_RATIO", "BORROW", 30),
        makeFact("CREDIT_BEHAVIOR", "BORROW", null),
        makeFact("GOAL_PROGRESS", "PLAN_PROTECT", null),
        makeFact("INSURANCE_COVERAGE", "PLAN_PROTECT", null),
      ];

      const res = scoreFinancialHealth(vulnerableFacts);
      expect(res.availablePillars).toHaveLength(3);
      expect(res.overallScore).toBeLessThan(55);
      expect(res.tier).toBe("vulnerable");
    });
  });

  describe("deriveHealthMetricFacts & computeFinancialHealthScore", () => {
    const dummyCashflow: CashflowResult = {
      income: 30_000_000,
      expense: 20_000_000,
      net: 10_000_000,
      byCategory: [],
      fixed: 5_000_000,
      discretionary: 15_000_000,
      pendingExpense: 0,
      meta: {
        period: { from: "2026-09-01", to: "2026-09-30", label: "2026-09" },
        freshness: "2026-09-15T00:00:00Z",
        sourceCoverage: { sources: ["msb"], knownCount: 1, unknownCount: 0 },
      },
    };

    const dummyAccounts: Account[] = [
      {
        id: "acc_1",
        type: "current",
        currency: "VND",
        balance: 100_000_000,
        availableBalance: 100_000_000,
        source: "msb",
        lastSyncedAt: "2026-09-15T00:00:00Z",
        institution: "MSB",
        maskedNumber: "•••• 1234",
        accountNumber: "12345678",
      },
    ];

    const dummyNetworth: NetWorthResult = {
      total: 100_000_000,
      assetsTotal: 100_000_000,
      liabilitiesTotal: 0,
      breakdown: [],
      unknownFields: [],
      hasUnknown: false,
      meta: {
        period: { from: "2026-09-01", to: "2026-09-30", label: "2026-09" },
        freshness: "2026-09-15T00:00:00Z",
        sourceCoverage: { sources: ["msb"], knownCount: 1, unknownCount: 0 },
      },
    };

    it("handles unconfirmed liabilities by keeping debt service ratio as null", () => {
      const res = computeFinancialHealthScore({
        cashflow: dummyCashflow,
        accounts: dummyAccounts,
        networth: dummyNetworth,
        liabilities: [], // 0 liabilities, but liabilitiesConfirmedComplete is false
        liabilitiesConfirmedComplete: false,
        goals: [],
      });

      const debtFact = res.metrics.find((m) => m.id === "DEBT_SERVICE_RATIO");
      expect(debtFact?.score).toBeNull();
      expect(debtFact?.reasonUnavailable).toContain("chưa được xác nhận hoàn tất");
    });

    it("gives 100 debt service score when liabilities are confirmed complete and empty", () => {
      const res = computeFinancialHealthScore({
        cashflow: dummyCashflow,
        accounts: dummyAccounts,
        networth: dummyNetworth,
        liabilities: [],
        liabilitiesConfirmedComplete: true, // affirmatively confirmed
        goals: [],
      });

      const debtFact = res.metrics.find((m) => m.id === "DEBT_SERVICE_RATIO");
      expect(debtFact?.score).toBe(100);
      expect(debtFact?.rawValue).toBe(0);
    });

    it("handles goals: null when no valid goals exist, scores correctly when goals exist", () => {
      const resNoGoals = computeFinancialHealthScore({
        cashflow: dummyCashflow,
        accounts: dummyAccounts,
        networth: dummyNetworth,
        liabilities: [],
        goals: [],
      });
      const goalFact1 = resNoGoals.metrics.find((m) => m.id === "GOAL_PROGRESS");
      expect(goalFact1?.score).toBeNull();
      expect(goalFact1?.reasonUnavailable).toContain("Chưa có mục tiêu tài chính");

      const resWithGoals = computeFinancialHealthScore({
        cashflow: dummyCashflow,
        accounts: dummyAccounts,
        networth: dummyNetworth,
        liabilities: [],
        goals: [
          {
            id: "g1",
            name: "Emergency Fund",
            targetAmount: 50_000_000,
            currentAmount: 25_000_000, // 50%
            source: "self_reported",
            targetDate: "2027-01-01",
          },
          {
            id: "g2",
            name: "Travel",
            targetAmount: 20_000_000,
            currentAmount: 20_000_000, // 100%
            source: "self_reported",
            targetDate: "2026-12-01",
          },
        ],
      });
      const goalFact2 = resWithGoals.metrics.find((m) => m.id === "GOAL_PROGRESS");
      // Average completion: (0.5 + 1.0) / 2 = 75%
      expect(goalFact2?.score).toBe(75);
    });

    it("handles multi-month cashflow history for SPENDING_TO_INCOME and SAVINGS_RATE", () => {
      const monthlyCashflows = [
        { month: "2026-07", income: 30_000_000, expense: 15_000_000 },
        { month: "2026-08", income: 30_000_000, expense: 18_000_000 },
        { month: "2026-09", income: 30_000_000, expense: 21_000_000 },
      ];
      // total income = 90M, total expense = 54M -> ratio = 54 / 90 = 0.60 (<= 0.7 -> 100)
      // accumulation = 90 - 54 = 36M -> savings rate = 36 / 90 = 0.40 (>= 0.2 -> 100)

      const res = computeFinancialHealthScore({
        cashflow: dummyCashflow,
        monthlyCashflows,
        accounts: dummyAccounts,
        networth: dummyNetworth,
        liabilities: [],
        liabilitiesConfirmedComplete: true,
        goals: [{ id: "g1", name: "Goal", targetAmount: 10_000_000, currentAmount: 8_000_000, source: "self_reported", targetDate: "2027-01-01" }],
        insuranceConfirmed: true,
      });

      const spendFact = res.metrics.find((m) => m.id === "SPENDING_TO_INCOME");
      expect(spendFact?.score).toBe(100);
      expect(spendFact?.rawValue).toBe(0.6);

      const saveFact = res.metrics.find((m) => m.id === "SAVINGS_RATE");
      expect(saveFact?.score).toBe(100);
      expect(saveFact?.rawValue).toBe(0.4);

      // Now with 5 computable metrics: SPENDING_TO_INCOME (100), CASH_RUNWAY (100), SAVINGS_RATE (100), DEBT_SERVICE_RATIO (100), GOAL_PROGRESS (80), INSURANCE_COVERAGE (100)
      expect(res.availablePillars.length).toBe(4);
      expect(res.overallScore).toBeGreaterThanOrEqual(90);
      expect(res.tier).toBe("healthy");
    });
  });
});
