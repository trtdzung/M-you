import { describe, expect, it } from "vitest";
import { extractInvestmentFeatures, investmentFeaturesSnapshot } from "../investment-nudge";
import { DEMO_NOW } from "@/lib/demo-clock";
import { makeFinancials, makeCashflow, makeJarBudgetLine, makeJarBudgetResult } from "@/insights/__tests__/helpers";

const NOW = DEMO_NOW;

function baseFinancials() {
  return makeFinancials({
    monthKey: "2026-09",
    cashflow: makeCashflow({ income: 10_000_000, expense: 7_000_000, fixed: 3_000_000 }),
    prevCashflow: makeCashflow({ income: 10_000_000, expense: 6_000_000 }),
    unallocatedPool: { amount: 2_500_000, overAllocated: false, source: "mock" },
    jarBudget: makeJarBudgetResult({
      lines: [
        makeJarBudgetLine({ huId: "food", limit: 2_000_000, limitState: "set", spent: 1_200_000, remaining: 800_000, status: null }),
        makeJarBudgetLine({ huId: "lifestyle", limit: 1_000_000, limitState: "set", spent: 950_000, remaining: 50_000, status: "near" }),
      ],
      summary: {
        totalLimit: 3_000_000, totalSpent: 2_150_000, totalSpentSet: 2_150_000,
        totalRebalanceNet: 0, totalRemaining: 850_000, pctUsed: 0.72,
        daysLeft: 15, setCount: 2, unsetCount: 0,
      },
      meta: {
        period: { from: "2026-08-31T17:00:00.000Z", to: "2026-09-30T16:59:59.999Z", label: "09/2026" },
        sourceCoverage: { sources: ["mock"], knownCount: 2, unknownCount: 0 },
        freshness: NOW.toISOString(),
      },
    }),
    networth: {
      total: 50_000_000, assetsTotal: 90_000_000, liabilitiesTotal: 40_000_000,
      breakdown: [
        { id: "a_deposit", kind: "asset", label: "Deposit", type: "deposit", amount: 60_000_000, source: "mock" as const },
        { id: "a_fund", kind: "asset", label: "Fund", type: "fund", amount: 30_000_000, source: "mock" as const },
        { id: "l_loan", kind: "liability", label: "Loan", type: "personal_loan", amount: 40_000_000, source: "mock" as const },
      ],
      unknownFields: [], hasUnknown: false,
      meta: {
        period: { from: "", to: "", label: "Hiện tại" },
        sourceCoverage: { sources: ["mock"], knownCount: 3, unknownCount: 0 },
        freshness: NOW.toISOString(),
      },
    },
    goals: [
      { id: "g1", name: "Quỹ khẩn cấp", targetAmount: 60_000_000, currentAmount: 30_000_000, targetDate: null, source: "self_reported" },
    ],
  });
}

describe("extractInvestmentFeatures", () => {
  it("extracts correct cashflow features", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    expect(f.income_this_month).toBe(10_000_000);
    expect(f.expense_this_month).toBe(7_000_000);
    expect(f.net_this_month).toBe(3_000_000);
  });

  it("computes savings_rate correctly", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    // (10M - 7M) / 10M = 0.3
    expect(f.savings_rate).toBeCloseTo(0.3);
  });

  it("computes fixed_expense_ratio", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    // 3M fixed / 7M expense ≈ 0.4286
    expect(f.fixed_expense_ratio).toBeCloseTo(3_000_000 / 7_000_000);
  });

  it("computes mom_expense_delta and mom_expense_pct", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    expect(f.mom_expense_delta).toBe(1_000_000); // 7M - 6M
    expect(f.mom_expense_pct).toBeCloseTo(1_000_000 / 6_000_000);
  });

  it("computes jar utilization correctly", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    // food: 1.2/2.0 = 0.6; lifestyle: 0.95/1.0 = 0.95 → avg = 0.775
    expect(f.avg_jar_utilization).toBeCloseTo(0.775);
    expect(f.jars_at_risk_count).toBe(1); // only lifestyle is "near"
    expect(f.jars_with_limit_count).toBe(2);
  });

  it("computes net worth correctly", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    expect(f.net_worth).toBe(50_000_000);
    expect(f.assets_total).toBe(90_000_000);
    expect(f.liabilities_total).toBe(40_000_000);
    // largest asset = 60M / 90M ≈ 0.667
    expect(f.asset_concentration).toBeCloseTo(60_000_000 / 90_000_000);
    expect(f.has_unknown_assets).toBe(false);
  });

  it("computes goal completion", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    expect(f.goal_count).toBe(1);
    expect(f.avg_goal_completion).toBeCloseTo(30_000_000 / 60_000_000); // 0.5
  });

  it("returns null for unallocated_balance when pool is unknown", () => {
    const fin = makeFinancials({
      ...baseFinancials(),
      unallocatedPool: { amount: "unknown", overAllocated: false, source: "mock" },
    });
    const f = extractInvestmentFeatures(fin, NOW);
    expect(f.unallocated_balance).toBeNull();
  });

  it("returns null savings_rate when income is zero", () => {
    const fin = makeFinancials({
      ...baseFinancials(),
      cashflow: makeCashflow({ income: 0, expense: 500_000 }),
    });
    const f = extractInvestmentFeatures(fin, NOW);
    expect(f.savings_rate).toBeNull();
  });

  it("returns null avg_jar_utilization when no jar has a set limit", () => {
    const fin = makeFinancials({
      ...baseFinancials(),
      jarBudget: makeJarBudgetResult({
        lines: [makeJarBudgetLine({ huId: "misc", limitState: "unset", limit: null })],
      }),
    });
    const f = extractInvestmentFeatures(fin, NOW);
    expect(f.avg_jar_utilization).toBeNull();
    expect(f.jars_with_limit_count).toBe(0);
  });

  it("includes as_of and source", () => {
    const f = extractInvestmentFeatures(baseFinancials(), NOW);
    expect(f.as_of).toBe(NOW.toISOString());
    expect(f.source).toBe("estimated");
  });

  it("snapshot changes when key features change", () => {
    const f1 = extractInvestmentFeatures(baseFinancials(), NOW);
    const fin2 = makeFinancials({
      ...baseFinancials(),
      unallocatedPool: { amount: 5_000_000, overAllocated: false, source: "mock" },
    });
    const f2 = extractInvestmentFeatures(fin2, NOW);
    expect(investmentFeaturesSnapshot(f1)).not.toBe(investmentFeaturesSnapshot(f2));
  });

  it("same inputs always produce same snapshot", () => {
    const f1 = extractInvestmentFeatures(baseFinancials(), NOW);
    const f2 = extractInvestmentFeatures(baseFinancials(), NOW);
    expect(investmentFeaturesSnapshot(f1)).toBe(investmentFeaturesSnapshot(f2));
  });
});
