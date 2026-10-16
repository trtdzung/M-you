import { describe, expect, it } from "vitest";
import { currentMonthKey } from "@/lib/demo-clock";
import { runDetectors } from "../run";
import { spendingSpike } from "../detectors/spending-spike";
import { incomeChange } from "../detectors/income-change";
import { numbersIn, factValues } from "../narrate";
import { answerPrompt } from "../assistant";
import type { Insight } from "../types";
import { makeCashflow, makeFinancials, makeJarBudgetLine, makeJarBudgetResult } from "./helpers";

/**
 * Every money-scale number in an explanation must trace to a sourceFact.
 * Money-scale = >= 1000, excluding 4-digit years (e.g. the comparison period
 * label "Tháng 5/2026"), which are not financial values.
 */
function assertGrounded(insight: Insight) {
  const facts = factValues(insight);
  for (const n of numbersIn(insight.explanation)) {
    const isYear = n >= 1900 && n <= 2100;
    if (n >= 1000 && !isYear) expect(facts, `${n} not grounded in "${insight.explanation}"`).toContain(n);
  }
}

describe("spendingSpike detector", () => {
  it("flags a category that jumped vs last month and stays grounded", () => {
    const insight = spendingSpike(
      makeFinancials({
        cashflow: makeCashflow({ byCategory: [{ categoryId: "shopping", amount: 3_000_000 }] }),
        prevCashflow: makeCashflow({ byCategory: [{ categoryId: "shopping", amount: 1_000_000 }] }),
      }),
    );
    expect(insight).not.toBeNull();
    expect(insight?.type).toBe("spending_spike");
    assertGrounded(insight!);
  });

  it("ignores small changes", () => {
    const insight = spendingSpike(
      makeFinancials({
        cashflow: makeCashflow({ byCategory: [{ categoryId: "dining", amount: 1_050_000 }] }),
        prevCashflow: makeCashflow({ byCategory: [{ categoryId: "dining", amount: 1_000_000 }] }),
      }),
    );
    expect(insight).toBeNull();
  });
});

describe("incomeChange detector", () => {
  it("flags a >=15% drop as attention and stays grounded", () => {
    const insight = incomeChange(
      makeFinancials({ cashflow: makeCashflow({ income: 15_000_000 }), prevCashflow: makeCashflow({ income: 25_000_000 }) }),
    );
    expect(insight?.severity).toBe("attention");
    assertGrounded(insight!);
  });
});

describe("runDetectors", () => {
  it("ranks urgent before info", () => {
    const insights = runDetectors(
      makeFinancials({
        monthKey: currentMonthKey(),
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 4_800_000, limit: 4_000_000, limitState: "set", status: "over", pct: 1.2, remaining: -800_000, thresholdHit: true }),
          ],
        }),
        recurring: [{ merchantNormalizedName: "netflix", label: "Netflix", categoryId: "subscriptions", direction: "debit", occurrences: 6, distinctMonths: 6, averageAmount: 260_000, averageDayOfMonth: 15, lastPostedAt: "2026-06-15T10:00:00.000Z", isExpense: true }],
      }),
    );
    expect(insights.length).toBeGreaterThanOrEqual(2);
    expect(insights[0].severity).toBe("urgent");
  });
});

describe("assistant answers", () => {
  it("explains the month from engine numbers", () => {
    const answer = answerPrompt("explain_month", makeFinancials({ cashflow: makeCashflow({ income: 25_000_000, expense: 18_000_000, net: 7_000_000 }) }));
    expect(answer.lines.join(" ")).toContain("25.000.000");
    expect(answer.sources.length).toBeGreaterThan(0);
  });

  it("names the top spending category", () => {
    const answer = answerPrompt("top_category", makeFinancials({ categorySpend: [{ categoryId: "dining", label: "Ăn uống", amount: 3_000_000, share: 0.4 }] }));
    expect(answer.lines[0]).toContain("Ăn uống");
  });
});
