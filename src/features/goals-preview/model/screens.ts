/**
 * Screen ids for the in-store navigation stack. Screens are NOT URL routes:
 * the whole prototype lives on /goals-preview and the test panel can jump
 * anywhere by pushing an entry.
 */
export const SCREEN_IDS = [
  // entry (T6)
  "FlowMap",
  "HomeMock",
  // create (T2)
  "TemplatePick",
  "GoalInfo",
  "OpeningFunds",
  "FeasibilityResult",
  "OptionsCompare",
  "OpenAccountConfirm",
  "StandingOrderSetup",
  "CreateSuccess",
  // list + detail (T3)
  "GoalList",
  "GoalDetail",
  "DepositFlow",
  "WithdrawFlow",
  "StandingOrderManage",
  "CloseGoalFlow",
  // assets + invest (T4)
  "AddFixedAsset",
  "RevalueAsset",
  "LiquidAssetDetail",
  "SellAsset",
  "InvestSuggest",
  "InvestConfirm",
  "MaturityChoice",
  // loan + lifecycle (T5)
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
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

/**
 * Loose params bag. Conventional keys: goalId, assetId, loanId, productId,
 * tab, amount, termMonths, draft (JSON string for wizard drafts).
 */
export type ScreenParams = Record<string, string | number | boolean | undefined>;

export interface ScreenEntry {
  /** Unique per push, so React can key transitions. */
  key: string;
  screen: ScreenId;
  params: ScreenParams;
}

export interface ScreenProps {
  params: ScreenParams;
}

export function paramString(params: ScreenParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : value === undefined ? undefined : String(value);
}

export function paramNumber(params: ScreenParams, key: string): number | undefined {
  const value = params[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
