import { assessProgress } from "../../engine/progress";
import type { GoalLedgerEntry, SavingsGoalView } from "../../model/types";

export function buildGoalTimeline(goal: Pick<SavingsGoalView, "createdAt" | "targetDate" | "targetAmount" | "currentAmount">, ledger: GoalLedgerEntry[], today: Date) {
  const now = today.getTime();
  const start = new Date(goal.createdAt).getTime();
  const end = new Date(`${goal.targetDate}T00:00:00.000Z`).getTime();
  const entries = ledger.filter(entry => new Date(entry.createdAt).getTime() <= now);
  const times = [...new Set([start, now, end, ...entries.map(entry => new Date(entry.createdAt).getTime())])].sort((a, b) => a - b);
  return times.map(time => ({
    time,
    plan: assessProgress({ ...goal, currentAmount: 0, now: new Date(time) }).expectedAmount,
    actual: time === now ? goal.currentAmount : entries.length && time <= now
      ? entries.filter(entry => new Date(entry.createdAt).getTime() <= time).reduce((sum, entry) => sum + (entry.kind === "deposit" ? entry.amount : -entry.amount), 0)
      : null,
  }));
}
