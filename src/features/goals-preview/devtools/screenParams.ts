import { selectActiveGoals } from "../store/selectors";
import type { PreviewState } from "../model/state";
import type { ScreenId, ScreenParams } from "../model/screens";
import type { Goal } from "../model/types";

/**
 * Picks sensible params (goalId / assetId / loanId) for jumping straight to a
 * screen from the flow map or the test panel, based on the current state.
 */

const NEEDS_FIXED_ASSET: ScreenId[] = ["RevalueAsset"];
const NEEDS_LIQUID_ASSET: ScreenId[] = ["LiquidAssetDetail", "SellAsset", "MaturityChoice"];
const NEEDS_LOAN: ScreenId[] = ["Prepay", "RepayOverview", "RepaySchedule"];
const NEEDS_GOAL: ScreenId[] = [
  "OpeningFunds",
  "FeasibilityResult",
  "OptionsCompare",
  "OpenAccountConfirm",
  "StandingOrderSetup",
  "CreateSuccess",
  "GoalDetail",
  "DepositFlow",
  "WithdrawFlow",
  "StandingOrderManage",
  "CloseGoalFlow",
  "AddFixedAsset",
  "RevalueAsset",
  "LiquidAssetDetail",
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
  if (NEEDS_FIXED_ASSET.includes(screen) && assets.some((a) => a.type === "fixed")) score += 10;
  if (NEEDS_LIQUID_ASSET.includes(screen) && assets.some((a) => a.type === "liquid")) score += 10;
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
  if (NEEDS_FIXED_ASSET.includes(screen)) {
    const a = assets.find((x) => x.type === "fixed");
    if (a) params.assetId = a.id;
    else missing = "mục tiêu này chưa có tài sản cố định";
  }
  if (NEEDS_LIQUID_ASSET.includes(screen) || screen === "InvestConfirm") {
    const a =
      assets.find((x) => x.type === "liquid" && x.status === "matured") ?? assets.find((x) => x.type === "liquid");
    if (a) params.assetId = a.id;
    else if (screen !== "InvestConfirm") missing = "mục tiêu này chưa có tài sản linh hoạt";
  }
  if (NEEDS_LOAN.includes(screen)) {
    const l = state.loans.find((x) => x.goalId === goal.id) ?? state.loans[0];
    if (l) params.loanId = l.id;
    else missing = "chưa có khoản vay";
  }
  return { params, missing };
}
