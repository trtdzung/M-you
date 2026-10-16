import { describe, expect, it } from "vitest";
import type { Budget } from "@/domain/models";
import { evaluateBudget } from "../budget";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5);
const NOW = new Date("2026-06-20T00:00:00.000Z"); // 10 days left in June

const budgets: Budget[] = [
  { categoryId: "dining", limit: 4_000_000, period: "monthly" },
  { categoryId: "shopping", limit: 2_000_000, period: "monthly" },
  { categoryId: "transport", limit: 1_000_000, period: "monthly" },
];

describe("evaluateBudget", () => {
  it("classifies ok / near / over by usage", () => {
    const lines = evaluateBudget(
      budgets,
      [
        txn({ categoryId: "dining", amount: 1_000_000 }), // 25% -> ok
        txn({ categoryId: "shopping", amount: 1_800_000 }), // 90% -> near
        txn({ categoryId: "transport", amount: 1_200_000 }), // 120% -> over
      ],
      JUNE,
      NOW,
    );
    const byCat = Object.fromEntries(lines.map((l) => [l.categoryId, l]));
    expect(byCat.dining.status).toBe("ok");
    expect(byCat.shopping.status).toBe("near");
    expect(byCat.transport.status).toBe("over");
  });

  it("nets refunds out of used amount", () => {
    const [line] = evaluateBudget(
      [{ categoryId: "shopping", limit: 2_000_000, period: "monthly" }],
      [
        txn({ categoryId: "shopping", type: "expense", amount: 1_500_000 }),
        txn({ categoryId: "shopping", type: "refund", direction: "credit", amount: 500_000 }),
      ],
      JUNE,
      NOW,
    );
    expect(line.used).toBe(1_000_000);
    expect(line.pct).toBeCloseTo(0.5);
  });

  it("computes days left in the period", () => {
    const [line] = evaluateBudget(budgets, [], JUNE, NOW);
    expect(line.daysLeft).toBe(11); // 20th 00:00 -> 30th 23:59
  });

  it("returns 0 days left once the period has passed", () => {
    const [line] = evaluateBudget(budgets, [], JUNE, new Date("2026-07-05T00:00:00.000Z"));
    expect(line.daysLeft).toBe(0);
  });
});
