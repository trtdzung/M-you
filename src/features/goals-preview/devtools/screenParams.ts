import { selectActiveGoals } from "../store/selectors";
import type { PreviewState } from "../model/state";
import type { ScreenId, ScreenParams } from "../model/screens";
import type { Goal } from "../model/types";

/**
 * Picks sensible params (goalId / assetId / loanId) for jumping straight to a
 * screen from the flow map or the test panel, based on the current state.
 */

const NEEDS_DECLARED_ASSET: ScreenId[] = ["RevalueAsset"];
const NEEDS_MSB_ASSET: ScreenId[] = ["MsbAssetDetail", "SellAsset", "MaturityChoice"];
const NEEDS_LOAN: ScreenId[] = ["Prepay", "RepayOverview", "RepaySchedule"];
const NEEDS_GOAL: ScreenId[] = [
  "OpenAccountConfirm",
  "StandingOrderSetup",
  "CreateSuccess",
  "GoalDetail",
  "DepositFlow",
  "WithdrawFlow",
  "StandingOrderManage",
  "EditTarget",
  "CloseGoalFlow",
  "AddAsset",
  "RevalueAsset",
  "MsbAssetDetail",
  "SellAsset",
  "InvestSuggest",
  "InvestConfirm",
  "MaturityChoice",
  "LoanSimulator",
  "LoanBlocked",
  "LoanApply",
  "DueResult",
  "AchievedIntro",
  "RepayOverview",
  "RepaySchedule",
  "Prepay",
  "CompletedCelebration",
  "MissedOptions",
];

export interface ResolvedJump {
  params: ScreenParams;
  /** Short Vietnamese note when the current data cannot fully fill the screen. */
  missing?: string;
}

function goalScore(state: PreviewState, screen: ScreenId, goal: Goal): number {
  let score = 0;
  if (goal.status === "accumulating" || goal.status === "repaying") score += 1;
  const assets = state.assets.filter((a) => a.goalId === goal.id && a.status !== "sold");
  if (NEEDS_DECLARED_ASSET.includes(screen) && assets.some((a) => a.type === "declared")) score += 10;
  if (NEEDS_MSB_ASSET.includes(screen) && assets.some((a) => a.type === "msb")) score += 10;
  if (NEEDS_LOAN.includes(screen) && state.loans.some((l) => l.goalId === goal.id)) score += 10;
  if (screen === "StandingOrderManage" && goal.standingOrder) score += 10;
  if (screen === "MissedOptions" && goal.status === "missed") score += 10;
  if (screen === "AchievedIntro" && goal.status === "achieved") score += 10;
  if (screen === "CompletedCelebration" && goal.status === "completed") score += 10;
  return score;
}

export function resolveJump(state: PreviewState, screen: ScreenId, preferredGoalId?: string): ResolvedJump {
  if (!NEEDS_GOAL.includes(screen)) return { params: {} };
  const candidates = [...selectActiveGoals(state), ...state.goals.filter((g) => !selectActiveGoals(state).includes(g))];
  const preferred = preferredGoalId ? state.goals.find((g) => g.id === preferredGoalId) : undefined;
  const goal =
    preferred ?? candidates.map((g) => ({ g, s: goalScore(state, screen, g) })).sort((a, b) => b.s - a.s)[0]?.g;
  if (!goal) return { params: {}, missing: "chưa có mục tiêu" };

  const params: ScreenParams = { goalId: goal.id };
  let missing: string | undefined;
  const assets = state.assets.filter((a) => a.goalId === goal.id && a.status !== "sold");
  if (NEEDS_DECLARED_ASSET.includes(screen)) {
    const a = assets.find((x) => x.type === "declared");
    if (a) params.assetId = a.id;
    else missing = "mục tiêu này chưa có tài sản tự khai";
  }
  if (NEEDS_MSB_ASSET.includes(screen) || screen === "InvestConfirm") {
    const a =
      assets.find((x) => x.type === "msb" && x.status === "matured") ?? assets.find((x) => x.type === "msb");
    if (a) params.assetId = a.id;
    else if (screen !== "InvestConfirm") missing = "mục tiêu này chưa có khoản đầu tư MSB";
  }
  if (NEEDS_LOAN.includes(screen)) {
    const l = state.loans.find((x) => x.goalId === goal.id) ?? state.loans[0];
    if (l) params.loanId = l.id;
    else missing = "chưa có khoản vay";
  }
  return { params, missing };
}
