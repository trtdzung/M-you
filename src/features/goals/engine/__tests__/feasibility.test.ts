import { describe, expect, it } from "vitest";
import { assessFeasibility } from "../feasibility";

const NOW = new Date("2026-09-15T00:00:00.000Z");

describe("assessFeasibility", () => {
  it("returns met with requiredMonthly 0 once the goal is already reached", () => {
    const met = assessFeasibility({
      targetAmount: 100,
      currentAmount: 100,
      targetDate: "2029-09-15",
      now: NOW,
      surplus: "unknown",
    });
    expect(met).toMatchObject({ result: "met", requiredMonthly: 0, source: "estimated" });

    const over = assessFeasibility({
      targetAmount: 100,
      currentAmount: 150,
      targetDate: "2029-09-15",
      now: NOW,
      surplus: 0,
    });
    expect(over.result).toBe("met");
    expect(over.requiredMonthly).toBe(0);
  });

  it("is feasible on the boundary requiredMonthly == surplus", () => {
    const result = assessFeasibility({
      targetAmount: 120,
      currentAmount: 0,
      targetDate: "2026-09-20",
      now: NOW,
      surplus: 120,
    });
    expect(result.monthsLeft).toBe(1);
    expect(result.requiredMonthly).toBe(120);
    expect(result.result).toBe("feasible");
  });

  it("is infeasible when surplus is 0 or negative", () => {
    for (const surplus of [0, -5]) {
      const result = assessFeasibility({
        targetAmount: 120,
        currentAmount: 0,
        targetDate: "2026-09-20",
        now: NOW,
        surplus,
      });
      expect(result.result).toBe("infeasible");
      expect(result.requiredMonthly).toBe(120);
      expect(result.surplus).toBe(surplus);
    }
  });

  it("stays unknown when surplus is unknown and still reports the required amount", () => {
    const result = assessFeasibility({
      targetAmount: 120,
      currentAmount: 0,
      targetDate: "2026-09-20",
      now: NOW,
      surplus: "unknown",
    });
    expect(result.result).toBe("unknown");
    expect(result.requiredMonthly).toBe(120);
    expect(result.surplus).toBe("unknown");
  });

  it("marks 600_000_000 over 36 months with surplus 12_000_000 as infeasible", () => {
    const result = assessFeasibility({
      targetAmount: 600_000_000,
      currentAmount: 0,
      targetDate: "2029-09-15",
      now: NOW,
      surplus: 12_000_000,
    });
    expect(result.monthsLeft).toBe(36);
    expect(result.requiredMonthly).toBe(16_666_667);
    expect(result.result).toBe("infeasible");
    expect(result.surplus).toBe(12_000_000);
    expect(result.source).toBe("estimated");
  });
});
