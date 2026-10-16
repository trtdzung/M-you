import { describe, expect, it } from "vitest";
import type { Goal } from "@/domain/models";
import { simulateGoal } from "../goals";

const ASOF = new Date("2026-09-15T00:00:00.000Z");

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    name: "Quỹ dự phòng",
    targetAmount: 90_000_000,
    currentAmount: 50_000_000,
    targetDate: null,
    source: "self_reported",
    ...overrides,
  };
}

describe("simulateGoal", () => {
  it("projects months-to-target for a positive contribution", () => {
    const p = simulateGoal(goal(), { monthlyContribution: 10_000_000, asOf: ASOF });
    expect(p.status).toBe("achievable");
    // (90m - 50m) / 10m = 4 months
    expect(p.monthsToTarget).toBe(4);
    expect(p.targetDate).toBe("2027-01");
    expect(p.series[0]).toEqual({ month: "2026-09", projected: 50_000_000 });
    // Series never overshoots the target.
    expect(p.series[p.series.length - 1].projected).toBe(90_000_000);
  });

  it("returns already_met when current >= target (no fabricated timeline)", () => {
    const p = simulateGoal(goal({ currentAmount: 95_000_000 }), { monthlyContribution: 5_000_000, asOf: ASOF });
    expect(p.status).toBe("already_met");
    expect(p.monthsToTarget).toBe(0);
  });

  it("stays unknown for zero or missing contribution (never defaults to 0)", () => {
    expect(simulateGoal(goal(), { monthlyContribution: 0, asOf: ASOF }).status).toBe("unknown");
    expect(simulateGoal(goal(), { asOf: ASOF }).monthsToTarget).toBeNull();
    expect(simulateGoal(goal(), { monthlyContribution: null, asOf: ASOF }).series).toEqual([]);
  });

  it("flags unreachable when the contribution is pathologically small", () => {
    const p = simulateGoal(goal(), { monthlyContribution: 1, asOf: ASOF });
    expect(p.status).toBe("unreachable");
    expect(p.targetDate).toBeNull();
  });

  it("is deterministic", () => {
    const a = simulateGoal(goal(), { monthlyContribution: 7_000_000, asOf: ASOF });
    const b = simulateGoal(goal(), { monthlyContribution: 7_000_000, asOf: ASOF });
    expect(a).toEqual(b);
  });
});
