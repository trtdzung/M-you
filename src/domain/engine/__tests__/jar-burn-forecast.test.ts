import { describe, expect, it } from "vitest";
import type { StoredCategory, Transaction } from "@/domain/models";
import { DEMO_NOW } from "@/lib/demo-clock";
import { makeFinancials, makeJarBudgetLine, makeJarBudgetResult } from "@/insights/__tests__/helpers";
import { txn } from "./helpers";
import { forecastJarBurn } from "../jar-burn-forecast";
import { generateDataset } from "@/providers/mock/fixtures/generate";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { CATEGORIES as STORED_CATEGORIES } from "@/domain/models/categories";
import { computeFinancials } from "../finance-compose";

const CATEGORIES: StoredCategory[] = [
  { id: "dining", label: "Ăn uống", kind: "expense", fixed: false },
  { id: "housing", label: "Nhà ở", kind: "expense", fixed: true },
];

function financials(remaining = 200_000, extra = {}) {
  return makeFinancials({
    monthKey: "2026-09",
    jarBudget: makeJarBudgetResult({
      lines: [makeJarBudgetLine({
        huId: "food", label: "Ăn uống", categoryIds: ["dining"],
        limit: 500_000, limitState: "set", spent: 300_000,
        remaining, 
      })],
      summary: { totalLimit: 500_000, totalSpent: 300_000, totalSpentSet: 300_000,
        totalRebalanceNet: 0, totalRemaining: remaining, pctUsed: 0.6,
        daysLeft: 10, setCount: 1, unsetCount: 0 },
      meta: { period: { from: "2026-08-31T17:00:00.000Z", to: "2026-09-30T16:59:59.999Z", label: "09/2026" },
        sourceCoverage: { sources: ["mock"], knownCount: 3, unknownCount: 0 }, freshness: "2026-09-12T00:00:00.000Z" },
    }),
    ...extra,
  });
}

function spending(): Transaction[] {
  return ["2026-09-10", "2026-09-11", "2026-09-12"].map((day) =>
    txn({ categoryId: "dining", amount: 100_000, postedAt: `${day}T00:00:00.000Z` }),
  );
}

describe("forecastJarBurn", () => {
  it("uses recent posted spend and the engine's rebalance-adjusted balance", () => {
    const result = forecastJarBurn(financials(200_000), [
      ...spending(),
      txn({ categoryId: "dining", amount: 100_000, postedAt: "2026-08-22T00:00:00.000Z" }),
      txn({ categoryId: "dining", amount: 1_000_000, status: "pending", postedAt: "2026-09-12T00:00:00.000Z" }),
      txn({ categoryId: "dining", amount: 1_000_000, type: "transfer", postedAt: "2026-09-12T00:00:00.000Z" }),
    ], CATEGORIES, DEMO_NOW);
    expect(result).toMatchObject({
      jarId: "food", balance: 200_000, daysRemaining: 10,
      dailyBurn: 31_048, safeDailySpend: 20_000,
      daysToEmpty: 6, projectedShortfall: 110_476,
      activeDays: 4, source: "estimated",
    });
  });

  it("does not extrapolate one-off purchases", () => {
    const rows = [txn({ categoryId: "dining", amount: 1_000_000, postedAt: "2026-09-12T00:00:00.000Z" })];
    expect(forecastJarBurn(financials(), rows, CATEGORIES, DEMO_NOW)).toBeNull();
  });

  it("skips fixed-bill jars until their future due dates can be modeled", () => {
    const f = financials();
    f.jarBudget.lines[0].categoryIds.push("housing");
    expect(forecastJarBurn(f, spending(), CATEGORIES, DEMO_NOW)).toBeNull();
  });

  it("suppresses a stale month, zero balance, and a safe run rate", () => {
    expect(forecastJarBurn(makeFinancials({ ...financials(), monthKey: "2026-08" }), spending(), CATEGORIES, DEMO_NOW)).toBeNull();
    expect(forecastJarBurn(financials(0), spending(), CATEGORIES, DEMO_NOW)).toBeNull();
    expect(forecastJarBurn(financials(1_000_000), spending(), CATEGORIES, DEMO_NOW)).toBeNull();
  });

  it("uses the jar's remaining balance after a refill rather than limit minus spent", () => {
    const before = forecastJarBurn(financials(200_000), spending(), CATEGORIES, DEMO_NOW);
    const after = forecastJarBurn(financials(600_000), spending(), CATEGORIES, DEMO_NOW);
    expect(before).not.toBeNull();
    expect(after).toBeNull();
  });

  it("can trigger against at least one seeded persona on the demo date", () => {
    const results = PERSONA_LIST.map((persona) => {
      const data = generateDataset(persona);
      const f = computeFinancials(data, "2026-09", {
        now: DEMO_NOW, jarConfig: DEFAULT_JAR_CONFIG, categories: STORED_CATEGORIES,
      });
      return forecastJarBurn(f, data.transactions, STORED_CATEGORIES, DEMO_NOW);
    });
    const demoIndex = PERSONA_LIST.findIndex((p) => p.cif === "CIF_0002");
    expect(results[demoIndex]?.jarId).toBe("lifestyle");
  });
});
