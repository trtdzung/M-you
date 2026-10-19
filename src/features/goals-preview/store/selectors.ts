import { isHistory } from "../engine/lifecycle";
import type { PreviewState } from "../model/state";
import type { Asset, Goal, GoalAccount, GoalTxn, Loan } from "../model/types";
import { usePreviewState } from "./PreviewStore";

/** Plain selectors (pure) + thin hooks for screens. */

export function selectGoal(state: PreviewState, goalId: string | undefined): Goal | undefined {
  return goalId ? state.goals.find((g) => g.id === goalId) : undefined;
}

export function selectAccount(state: PreviewState, goal: Goal | undefined): GoalAccount | undefined {
  return goal?.accountId ? state.accounts.find((a) => a.id === goal.accountId) : undefined;
}

export function selectLoan(state: PreviewState, goal: Goal | undefined): Loan | undefined {
  return goal?.loanId ? state.loans.find((l) => l.id === goal.loanId) : undefined;
}

export function selectAsset(state: PreviewState, assetId: string | undefined): Asset | undefined {
  return assetId ? state.assets.find((a) => a.id === assetId) : undefined;
}

/** Newest first. */
export function selectGoalTxns(state: PreviewState, goalId: string): GoalTxn[] {
  return state.txns
    .filter((t) => t.goalId === goalId)
    .slice()
    .reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Non-draft goals not in history, by priority. */
export function selectActiveGoals(state: PreviewState): Goal[] {
  return state.goals.filter((g) => g.status !== "draft" && !isHistory(g.status)).sort((a, b) => a.priority - b.priority);
}

export function selectHistoryGoals(state: PreviewState): Goal[] {
  return state.goals
    .filter((g) => isHistory(g.status))
    .sort((a, b) => (b.completedAt ?? b.closedAt ?? "").localeCompare(a.completedAt ?? a.closedAt ?? ""));
}

/** Goal shown on the Home card: highest priority active goal. */
export function selectTopGoal(state: PreviewState): Goal | undefined {
  return selectActiveGoals(state)[0];
}

export function useGoal(goalId: string | undefined): Goal | undefined {
  return selectGoal(usePreviewState(), goalId);
}
