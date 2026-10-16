import { describe, expect, it } from "vitest";
import type { BudgetLine } from "@/domain/engine";
import { makeFinancials } from "@/insights/__tests__/helpers";
import { buildOpener } from "../openers";

function overBudgetLine(): BudgetLine {
  return { categoryId: "dining", label: "Ăn uống", limit: 4_000_000, used: 5_200_000, pct: 1.3, daysLeft: 5, status: "over" };
}

describe("buildOpener", () => {
  it("surfaces the highest-severity insight as an opener", () => {
    const f = makeFinancials({ budgetLines: [overBudgetLine()] });
    const opener = buildOpener(f);
    expect(opener).not.toBeNull();
    expect(opener!.text).toContain("Ăn uống");
    expect(opener!.sources.length).toBeGreaterThan(0);
  });

  it("returns null when nothing is notable (clean month)", () => {
    expect(buildOpener(makeFinancials())).toBeNull();
  });
});
