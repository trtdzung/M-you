import type { SavingsGoalView } from "../model/types";

/** Saved and target totals exclude goals the user has archived. */
export function summarizeGoals(goals: SavingsGoalView[]) {
  const live = goals.filter(goal => goal.status !== "archived");
  return {
    saved: live.reduce((sum, goal) => sum + goal.currentAmount, 0),
    target: live.reduce((sum, goal) => sum + goal.targetAmount, 0),
    active: live.filter(goal => goal.status === "active").length,
    count: live.length,
  };
}
