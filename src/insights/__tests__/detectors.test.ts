import { describe, expect, it } from "vitest";
import { currentMonthKey } from "@/lib/demo-clock";
import { runDetectors } from "../run";
import { spendingSpike } from "../detectors/spending-spike";
import { numbersIn, factValues } from "../narrate";
import { REBALANCE_CATEGORY, type Transaction } from "@/domain/models";
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

  it("H3: một hũ vượt hạn mức ĐÃ ĐƯỢC BÙ chỉ sinh ĐÚNG MỘT insight, không double-warn", () => {
    // Hai trục: `status` vẫn "over" (4.8tr trên hạn mức 4tr) trong khi số dư đã được
    // bù về 0. `jarOverspendCovered` là nguồn duy nhất kể chuyện này; `jarPressure`
    // phải im để người dùng không thấy hai card nói cùng một việc.
    const leg = {
      id: "rb1", accountId: "acc", postedAt: `${currentMonthKey()}-12T10:00:00.000Z`,
      amount: 800_000, direction: "debit", type: "transfer", categoryId: REBALANCE_CATEGORY,
      merchantName: "Điều chỉnh hũ", status: "posted", source: "self_reported", currency: "VND",
      rebalance: { fromJarId: "transport", toJarId: "food", triggerTxnId: "t1", origin: "auto" },
    } as unknown as Transaction;

    const insights = runDetectors(
      makeFinancials({
        monthKey: currentMonthKey(),
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 4_800_000, limit: 4_000_000, limitState: "set", status: "over", pct: 1.2, rebalanceNet: 800_000, remaining: 0, thresholdHit: true }),
            makeJarBudgetLine({ huId: "transport", label: "Đi lại", spent: 0, limit: 2_000_000, limitState: "set", status: "ok", pct: 0, rebalanceNet: -800_000, remaining: 1_200_000 }),
          ],
        }),
        jarRebalances: [leg],
      }),
    );

    const aboutFood = insights.filter((i) => i.explanation.includes("Ăn uống"));
    expect(aboutFood).toHaveLength(1);
    expect(aboutFood[0].type).toBe("jar_overspend_covered");
    expect(insights.some((i) => i.type === "jar_pressure")).toBe(false);
  });
});
