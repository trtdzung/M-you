import { describe, expect, it } from "vitest";
import type { GoalFeasibility } from "../../model/types";
import { cutCategoryLever } from "../levers/cut-category";
import { extendDateLever } from "../levers/extend-date";
import { buildLevers } from "../levers";
import { reduceAmountLever } from "../levers/reduce-amount";

const NOW = new Date("2026-09-15T00:00:00.000Z");

function feasibility(
  overrides: Partial<GoalFeasibility> & Pick<GoalFeasibility, "result" | "surplus">,
): GoalFeasibility {
  return {
    monthsLeft: 36,
    requiredMonthly: 16_666_667,
    source: "estimated",
    ...overrides,
  };
}

const house = feasibility({ result: "infeasible", surplus: 12_000_000 });

describe("extend / reduce / cut levers", () => {
  it("extends 600tr at 12tr/month to 50 months (2030-11-15)", () => {
    expect(extendDateLever(600_000_000, 0, 12_000_000, NOW)).toEqual({
      kind: "extend_date",
      months: 50,
      newDate: "2030-11-15",
    });
  });

  it("reduces the target to what the surplus can reach, rounded down to 100_000", () => {
    expect(reduceAmountLever(0, 12_000_000, 36)).toEqual({
      kind: "reduce_amount",
      newTarget: 432_000_000,
    });
    expect(reduceAmountLever(50_000, 12_000_000, 36).newTarget).toBe(432_000_000);
    expect(reduceAmountLever(0, 199_999, 1).newTarget).toBe(100_000);
    expect(reduceAmountLever(0, 99_999, 1).newTarget).toBe(0);
  });

  it("cuts the biggest category and sets enough from the gap versus that average", () => {
    expect(cutCategoryLever(16_666_667, 12_000_000, [])).toBeNull();
    expect(
      cutCategoryLever(16_666_667, 12_000_000, [
        { categoryId: "rent", average: 3_000_000 },
        { categoryId: "food", average: 8_000_000 },
      ]),
    ).toEqual({
      kind: "cut_category",
      categoryId: "food",
      cutPerMonth: 4_666_667,
      enough: true,
    });
    expect(
      cutCategoryLever(16_666_667, 12_000_000, [{ categoryId: "food", average: 4_000_000 }]),
    ).toMatchObject({ enough: false });
    expect(
      cutCategoryLever(16_666_667, 12_000_000, [{ categoryId: "food", average: 4_666_667 }]),
    ).toMatchObject({ enough: true });
  });

  it("keeps the first category when two averages tie", () => {
    expect(
      cutCategoryLever(10, 4, [
        { categoryId: "a", average: 5 },
        { categoryId: "b", average: 5 },
      ]),
    ).toMatchObject({ categoryId: "a" });
  });
});

describe("buildLevers", () => {
  it("offers extend, reduce and a sufficient cut for the 600tr example", () => {
    const levers = buildLevers({
      feasibility: house,
      flexibility: "flexible",
      targetAmount: 600_000_000,
      currentAmount: 0,
      now: NOW,
      categoryAverages: [{ categoryId: "food", average: 8_000_000 }],
    });
    expect(levers).toEqual([
      { kind: "extend_date", newDate: "2030-11-15", months: 50 },
      { kind: "reduce_amount", newTarget: 432_000_000 },
      { kind: "cut_category", categoryId: "food", cutPerMonth: 4_666_667, enough: true },
    ]);
  });

  it("omits extend_date when flexibility is fixed", () => {
    const levers = buildLevers({
      feasibility: house,
      flexibility: "fixed",
      targetAmount: 600_000_000,
      currentAmount: 0,
      now: NOW,
      categoryAverages: [{ categoryId: "food", average: 8_000_000 }],
    });
    expect(levers.map((l) => l.kind)).toEqual(["reduce_amount", "cut_category"]);
  });

  it("returns no levers when surplus is 0, negative, or unknown, or the plan is not infeasible", () => {
    const base = {
      flexibility: "flexible" as const,
      targetAmount: 600_000_000,
      currentAmount: 0,
      now: NOW,
      categoryAverages: [{ categoryId: "food", average: 8_000_000 }],
    };
    expect(buildLevers({ ...base, feasibility: feasibility({ result: "infeasible", surplus: 0 }) })).toEqual([]);
    expect(buildLevers({ ...base, feasibility: feasibility({ result: "infeasible", surplus: -1 }) })).toEqual([]);
    expect(
      buildLevers({ ...base, feasibility: feasibility({ result: "unknown", surplus: "unknown" }) }),
    ).toEqual([]);
    expect(
      buildLevers({ ...base, feasibility: feasibility({ result: "infeasible", surplus: "unknown" }) }),
    ).toEqual([]);
    expect(
      buildLevers({ ...base, feasibility: feasibility({ result: "feasible", surplus: 20_000_000 }) }),
    ).toEqual([]);
    expect(buildLevers({ ...base, feasibility: feasibility({ result: "met", surplus: 12_000_000, requiredMonthly: 0 }) })).toEqual(
      [],
    );
  });

  it("omits cut_category when there is no category data and marks enough false when the cut exceeds the average", () => {
    const none = buildLevers({
      feasibility: house,
      flexibility: "flexible",
      targetAmount: 600_000_000,
      currentAmount: 0,
      now: NOW,
      categoryAverages: [],
    });
    expect(none.map((l) => l.kind)).toEqual(["extend_date", "reduce_amount"]);

    const short = buildLevers({
      feasibility: house,
      flexibility: "flexible",
      targetAmount: 600_000_000,
      currentAmount: 0,
      now: NOW,
      categoryAverages: [{ categoryId: "food", average: 1_000_000 }],
    });
    const cut = short.find((l) => l.kind === "cut_category");
    expect(cut).toMatchObject({ cutPerMonth: 4_666_667, enough: false });
  });
});
