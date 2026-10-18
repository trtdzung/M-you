import "server-only";

import { buildAdvisorContext } from "../advisor/context";
import { decideReminder } from "../engine/reminders";
import { buildLevers } from "../engine/levers";
import type { GoalReminder } from "../model/reminder-types";
import { goalCashflowInput } from "./cashflow-input";
import { toGoalView } from "./goal-view";
import { getGoal, resumeExpiredPauses } from "./goals-repo";
import { listLedger } from "./ledger-repo";
import { insertReminder, lastReminder, notifiedMilestones } from "./reminders-repo";

const WEEK_MS = 7 * 86_400_000;
const INCOME_DROP_SHARE = 0.7;

/** Income of the last month with data fell well below the earlier average. */
function incomeDropped(months: { income: number; txnCount: number }[]): boolean {
  const used = months.filter((m) => m.txnCount > 0);
  if (used.length < 3) return false;
  const last = used[used.length - 1].income;
  const before = used.slice(0, -1);
  const avg = before.reduce((s, m) => s + m.income, 0) / before.length;
  return avg > 0 && last < avg * INCOME_DROP_SHARE;
}

/**
 * The note to show for a goal: at most one per goal per week. Within a week of the last note it is
 * shown again (until dismissed) and nothing new is created; after that the engine decides afresh.
 */
export function reminderFor(cif: string, goalId: string, now: Date): GoalReminder | null {
  resumeExpiredPauses(cif, now);
  const goal = getGoal(cif, goalId);
  if (!goal) return null;
  const last = lastReminder(cif, goalId);
  if (last && now.getTime() - new Date(last.reminder.createdAt).getTime() < WEEK_MS) {
    return last.dismissed ? null : last.reminder;
  }
  const ledger = listLedger(cif, goalId);
  const cashflow = goalCashflowInput(cif, now);
  const view = toGoalView(goal, ledger, now, cashflow);
  const ctx = buildAdvisorContext(cif, now);
  const decision = decideReminder({
    goal: view,
    ledger,
    levers: buildLevers({
      feasibility: view.feasibility,
      flexibility: goal.flexibility,
      targetAmount: goal.targetAmount,
      currentAmount: view.currentAmount,
      now,
      categoryAverages: cashflow.categoryAverages,
    }),
    pauseSignal:
      incomeDropped(ctx.months) || ctx.signals.some((s) => s.kind === "spending_spike" || s.kind === "cashflow_risk"),
    notifiedMilestones: notifiedMilestones(cif, goalId),
    now,
  });
  return decision ? insertReminder(cif, goalId, decision, now) : null;
}
