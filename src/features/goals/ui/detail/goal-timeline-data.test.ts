import { describe, expect, it } from "vitest";
import { buildGoalTimeline } from "./goal-timeline-data";
import type { GoalLedgerEntry } from "../../model/types";
const goal = { createdAt: "2026-01-01T00:00:00.000Z", targetDate: "2027-01-01", targetAmount: 10000000, currentAmount: 1500000 };
const today = new Date("2026-07-01T00:00:00.000Z");
const entry = (kind: "deposit" | "withdraw", amount: number, createdAt: string): GoalLedgerEntry => ({ id: createdAt, goalId: "test", kind, amount, createdAt, note: null, source: "self_reported" });
describe("goal timeline", () => {
  it("does not invent historical balances without a ledger", () => {
    const points = buildGoalTimeline(goal, [], today);
    expect(points.filter(point => point.actual !== null)).toEqual([expect.objectContaining({time: today.getTime(), actual: 1500000})]);
    expect(points.at(-1)?.plan).toBe(goal.targetAmount);
  });
  it("reconstructs deposits and withdrawals chronologically and leaves future actual empty", () => {
    const points = buildGoalTimeline(goal, [entry("withdraw", 500000, "2026-03-01T00:00:00.000Z"), entry("deposit", 2000000, "2026-02-01T00:00:00.000Z")], today);
    expect(points.map(point => point.actual)).toEqual([0, 2000000, 1500000, 1500000, null]);
  });
});
