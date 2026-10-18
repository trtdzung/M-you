import "server-only";

import { assessFeasibility } from "../engine/feasibility";
import { assessProgress } from "../engine/progress";
import { averageSurplus } from "../engine/surplus";
import type { GoalLedgerEntry, SavingsGoal, SavingsGoalView } from "../model/types";
import type { GoalCashflowInput } from "./cashflow-input";
import { listLedger } from "./ledger-repo";

/** Σ deposit − Σ withdraw over already-loaded entries. */
function sumLedger(ledger: GoalLedgerEntry[]): number {
  return ledger.reduce((s, e) => s + (e.kind === "deposit" ? e.amount : -e.amount), 0);
}

/** Goal + ledger + engine -> the view the screens render. */
export function toGoalView(
  goal: SavingsGoal,
  ledger: GoalLedgerEntry[],
  now: Date,
  cashflow: GoalCashflowInput,
): SavingsGoalView {
  const currentAmount = sumLedger(ledger);
  const feasibility = assessFeasibility({
    targetAmount: goal.targetAmount,
    currentAmount,
    targetDate: goal.targetDate,
    now,
    surplus: averageSurplus(cashflow.months).value,
  });
  const progress = assessProgress({
    targetAmount: goal.targetAmount,
    currentAmount,
    createdAt: goal.createdAt,
    targetDate: goal.targetDate,
    now,
  });
  return { ...goal, currentAmount, progress, feasibility };
}

/** Same as `toGoalView`, reading the goal's ledger from the DB. */
export function loadGoalView(
  cif: string,
  goal: SavingsGoal,
  now: Date,
  cashflow: GoalCashflowInput,
): SavingsGoalView {
  return toGoalView(goal, listLedger(cif, goal.id), now, cashflow);
}
