import { expect, it } from "vitest";
import { summarizeGoals } from "./summary";
import type { SavingsGoalView } from "../model/types";
it("totals current and target amounts without archived goals", () => {
  const goals = [
    { status: "active", currentAmount: 1000000, targetAmount: 10000000 },
    { status: "paused", currentAmount: 2000000, targetAmount: 20000000 },
    { status: "archived", currentAmount: 9000000, targetAmount: 90000000 },
  ] as SavingsGoalView[];
  expect(summarizeGoals(goals)).toEqual({ saved: 3000000, target: 30000000, active: 1, count: 2 });
  expect(summarizeGoals([])).toEqual({ saved: 0, target: 0, active: 0, count: 0 });
});
