import { describe, expect, it } from "vitest";
import { assessProgress, type ProgressInput } from "../progress";

const DAY = 86_400_000;
const START = new Date("2026-01-01T00:00:00.000Z");

function at(days: number): Date {
  return new Date(START.getTime() + days * DAY);
}

function input(overrides: Partial<ProgressInput> & Pick<ProgressInput, "now" | "currentAmount">): ProgressInput {
  return {
    targetAmount: 1_000_000,
    createdAt: START.toISOString(),
    targetDate: at(100).toISOString().slice(0, 10),
    ...overrides,
  };
}

describe("assessProgress", () => {
  it("expects 0 on the day the goal is created", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    const result = assessProgress({
      targetAmount: 1_000_000,
      currentAmount: 0,
      createdAt: now.toISOString(),
      targetDate: "2029-09-15",
      now,
    });
    expect(result.expectedAmount).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.milestone).toBe(0);
    expect(result.state).toBe("on_track");
  });

  it("treats a gap of exactly 10% of target as slightly_behind and one đồng more as off_track", () => {
    const now = at(20);
    const behind = assessProgress(input({ now, currentAmount: 100_000 }));
    expect(behind.expectedAmount).toBe(200_000);
    expect(behind.state).toBe("slightly_behind");

    const off = assessProgress(input({ now, currentAmount: 99_999 }));
    expect(off.expectedAmount).toBe(200_000);
    expect(off.state).toBe("off_track");
  });

  it("is ahead only when current is strictly above expected * 1.1", () => {
    const now = at(10);
    const onTrack = assessProgress(input({ now, currentAmount: 110_000 }));
    expect(onTrack.expectedAmount).toBe(100_000);
    expect(onTrack.state).toBe("on_track");

    const ahead = assessProgress(input({ now, currentAmount: 110_001 }));
    expect(ahead.state).toBe("ahead");

    const exactPlan = assessProgress(input({ now, currentAmount: 100_000 }));
    expect(exactPlan.state).toBe("on_track");
  });

  it("sets expectedAmount to the target once the deadline has passed", () => {
    const result = assessProgress(input({ now: at(101), currentAmount: 0 }));
    expect(result.expectedAmount).toBe(1_000_000);
    expect(result.state).toBe("off_track");
  });

  it("reports 100% and milestone 100 on_track once current reaches the target", () => {
    const now = at(101);
    const reached = assessProgress(input({ now, currentAmount: 1_000_000 }));
    expect(reached).toMatchObject({
      percent: 100,
      milestone: 100,
      state: "on_track",
      expectedAmount: 1_000_000,
    });

    const over = assessProgress(input({ now, currentAmount: 1_500_000 }));
    expect(over.percent).toBe(100);
    expect(over.milestone).toBe(100);
    expect(over.state).toBe("on_track");
  });

  it("assigns milestones 25, 50 and 75 and rounds percent to one decimal", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    const createdAt = now.toISOString();
    const base = { createdAt, targetDate: "2029-09-15", now, targetAmount: 1_000_000 };

    expect(assessProgress({ ...base, currentAmount: 249_000 }).percent).toBe(24.9);
    expect(assessProgress({ ...base, currentAmount: 249_000 }).milestone).toBe(0);

    expect(assessProgress({ ...base, currentAmount: 250_000 })).toMatchObject({
      percent: 25,
      milestone: 25,
    });
    expect(assessProgress({ ...base, currentAmount: 500_000 }).milestone).toBe(50);
    expect(assessProgress({ ...base, currentAmount: 750_000 }).milestone).toBe(75);
    expect(assessProgress({ ...base, currentAmount: 999_000 }).percent).toBe(99.9);
    expect(assessProgress({ ...base, currentAmount: 999_000 }).milestone).toBe(75);

    const third = assessProgress({
      ...base,
      targetAmount: 3_000_000,
      currentAmount: 1_000_000,
    });
    expect(third.percent).toBe(33.3);
    expect(third.milestone).toBe(25);
  });

  it("clamps elapsed time to the plan window", () => {
    const before = assessProgress(
      input({ now: at(-5), currentAmount: 0, createdAt: START.toISOString() }),
    );
    expect(before.expectedAmount).toBe(0);

    const inverted = assessProgress(
      input({
        now: START,
        currentAmount: 0,
        createdAt: "2026-12-01T00:00:00.000Z",
        targetDate: "2026-01-01",
      }),
    );
    expect(inverted.expectedAmount).toBe(1_000_000);
  });
});
