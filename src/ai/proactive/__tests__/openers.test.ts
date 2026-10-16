import { describe, expect, it } from "vitest";
import { currentMonthKey } from "@/lib/demo-clock";
import { makeFinancials, makeJarBudgetLine, makeJarBudgetResult } from "@/insights/__tests__/helpers";
import { buildOpener } from "../openers";

describe("buildOpener", () => {
  it("surfaces the highest-severity insight as an opener", () => {
    // The per-category `budgetPressure` detector was retired (phase 08); the sole
    // budget warning is now the per-hũ `jarPressure`, driven by `jarBudget`.
    const f = makeFinancials({
      monthKey: currentMonthKey(),
      jarBudget: makeJarBudgetResult({
        lines: [
          makeJarBudgetLine({
            huId: "food",
            label: "Ăn uống",
            spent: 5_200_000,
            limit: 4_000_000,
            limitState: "set",
            status: "over",
            pct: 1.3,
            remaining: -1_200_000,
            thresholdHit: true,
          }),
        ],
      }),
    });
    const opener = buildOpener(f);
    expect(opener).not.toBeNull();
    expect(opener!.text).toContain("Ăn uống");
    expect(opener!.sources.length).toBeGreaterThan(0);
  });

  it("returns null when nothing is notable (clean month)", () => {
    expect(buildOpener(makeFinancials())).toBeNull();
  });
});
