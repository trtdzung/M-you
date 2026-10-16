import { describe, expect, it } from "vitest";
import type { Goal } from "@/domain/models";
import { computeSurplus, simulateSurplusAllocation } from "../surplus";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g",
  name: "Quỹ",
  targetAmount: 10_000_000,
  currentAmount: 2_000_000,
  targetDate: null,
  source: "self_reported",
  ...over,
});

describe("computeSurplus (M12 formula)", () => {
  it("is income − expense, floored at 0", () => {
    expect(computeSurplus(20_000_000, 14_000_000)).toBe(6_000_000);
  });

  it("[Security-F6] is 'unknown' when income is unknown — never 0", () => {
    expect(computeSurplus("unknown", 14_000_000)).toBe("unknown");
  });

  it("is 0 (never negative) on a deficit month", () => {
    expect(computeSurplus(10_000_000, 14_000_000)).toBe(0);
  });
});

describe("simulateSurplusAllocation", () => {
  it("splits a positive surplus and reports the remainder", () => {
    const plan = simulateSurplusAllocation({
      surplus: 6_000_000,
      goals: [goal({ id: "a", name: "A" }), goal({ id: "b", name: "B" })],
      split: { a: 2_000_000, b: 1_000_000 },
    });
    expect(plan.allocated).toBe(3_000_000);
    expect(plan.remaining).toBe(3_000_000);
    expect(plan.targets[0].amount).toBe(2_000_000);
    expect(plan.targets[0].projectedAmount).toBe(4_000_000);
  });

  it("[Security-F6] keeps surplus and remaining 'unknown', allocating nothing", () => {
    const plan = simulateSurplusAllocation({
      surplus: "unknown",
      goals: [goal()],
      split: { g: 5_000_000 },
    });
    expect(plan.surplus).toBe("unknown");
    expect(plan.remaining).toBe("unknown");
    expect(plan.allocated).toBe(0);
    expect(plan.targets[0].amount).toBe(0);
    expect(plan.targets[0].projectedAmount).toBe(2_000_000); // unchanged
  });

  it("caps allocation at the goal headroom — never overfunds", () => {
    const plan = simulateSurplusAllocation({
      surplus: 50_000_000,
      goals: [goal({ currentAmount: 9_000_000, targetAmount: 10_000_000 })], // 1M headroom
      split: { g: 5_000_000 },
    });
    expect(plan.targets[0].amount).toBe(1_000_000);
    expect(plan.targets[0].projectedAmount).toBe(10_000_000);
    expect(plan.targets[0].reachesTarget).toBe(true);
    expect(plan.remaining).toBe(49_000_000);
  });

  it("caps later goals at the surplus still unallocated (array order)", () => {
    const plan = simulateSurplusAllocation({
      surplus: 3_000_000,
      goals: [goal({ id: "a", name: "A" }), goal({ id: "b", name: "B" })],
      split: { a: 2_500_000, b: 2_500_000 },
    });
    expect(plan.targets[0].amount).toBe(2_500_000);
    expect(plan.targets[1].amount).toBe(500_000); // only 500k left
    expect(plan.remaining).toBe(0);
  });

  it("sanitises negative / non-finite / fractional requests", () => {
    const plan = simulateSurplusAllocation({
      surplus: 5_000_000,
      goals: [goal({ id: "neg" }), goal({ id: "nan" }), goal({ id: "frac" })],
      split: { neg: -100, nan: Number.NaN, frac: 1_000_000.6 },
    });
    expect(plan.targets[0].amount).toBe(0); // negative → 0
    expect(plan.targets[1].amount).toBe(0); // NaN → 0
    expect(plan.targets[2].amount).toBe(1_000_001); // rounded
  });

  it("marks an already-met goal without allocating to it under unknown surplus", () => {
    const plan = simulateSurplusAllocation({
      surplus: "unknown",
      goals: [goal({ currentAmount: 12_000_000, targetAmount: 10_000_000 })],
      split: {},
    });
    expect(plan.targets[0].reachesTarget).toBe(true);
  });
});
