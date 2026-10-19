import type { PreviewState } from "../model/state";
import type { ScreenId, ScreenParams } from "../model/screens";
import type {
  CustomerProfile,
  FixedAssetCategory,
  GoalFlexibility,
  GoalTemplate,
  ISODate,
  ToastTone,
  ValueSource,
} from "../model/types";

export interface CreateGoalInput {
  name: string;
  template: GoalTemplate;
  targetAmount: number;
  targetDate: ISODate;
  flexibility: GoalFlexibility;
  /** Default: after every existing saving goal. */
  priority?: number;
  note?: string;
}

export type SimEvent = "salary" | "bigExpense" | "standingOrderFail" | "overdue";

export type NavAction =
  | { type: "nav/params"; params: ScreenParams }
  | { type: "nav/push"; screen: ScreenId; params?: ScreenParams }
  | { type: "nav/pop"; count?: number }
  | { type: "nav/replace"; screen: ScreenId; params?: ScreenParams }
  /** Stack becomes [screen] (default GoalList). */
  | { type: "nav/reset"; screen?: ScreenId; params?: ScreenParams }
  /** Pop until `screen` is on top (no-op if absent). */
  | { type: "nav/popTo"; screen: ScreenId };

export type PreviewAction =
  // --- scenario / sim
  | { type: "loadScenario"; scenarioId: string; jump?: boolean }
  | { type: "reset" }
  | { type: "hydrate"; state: PreviewState }
  | { type: "advanceTime"; days: number }
  | { type: "setFundPriceShift"; pct: number }
  | { type: "setCustomer"; patch: Partial<CustomerProfile> }
  | { type: "triggerEvent"; event: SimEvent; goalId?: string }
  // --- create
  | { type: "createGoal"; input: CreateGoalInput }
  | { type: "updateDraftGoal"; goalId: string; patch: Partial<CreateGoalInput> }
  | { type: "discardDraftGoal"; goalId: string }
  | { type: "openAccount"; goalId: string; initialDeposit: number }
  // --- cash
  | { type: "deposit"; goalId: string; amount: number; note?: string }
  | { type: "withdraw"; goalId: string; amount: number; note?: string; emergency?: boolean }
  | { type: "setStandingOrder"; goalId: string; amount: number; dayOfMonth: number; active?: boolean }
  | { type: "runStandingOrderNow"; goalId: string }
  // --- loan reservation (before the due date)
  | { type: "reserveLoan"; goalId: string; productId: string; principal: number; termMonths: number }
  | { type: "cancelReservedLoan"; goalId: string }
  // --- assets / invest
  | {
      type: "addFixedAsset";
      goalId: string;
      name: string;
      category: FixedAssetCategory;
      value: number;
      countPercent: number;
      valuationDate?: ISODate;
      source?: ValueSource;
      instrumentId?: string;
      quantity?: number;
      accrual?: { principal: number; ratePa: number; startDate: ISODate; maturityDate?: ISODate };
      institution?: string;
    }
  | { type: "revalueAsset"; assetId: string; value: number; countPercent?: number; valuationDate?: ISODate }
  | { type: "removeAsset"; assetId: string }
  /** Outside market asset (gold, stock, fund): the customer bought or sold, value follows the price. */
  | { type: "setAssetQuantity"; assetId: string; quantity: number }
  | { type: "invest"; goalId: string; productId: string; amount: number; termMonths?: number }
  /** Liquid: sells `fraction` (default 1) at current value. Fixed: records `proceeds` (default declared value). */
  | { type: "sellAsset"; assetId: string; fraction?: number; proceeds?: number }
  | { type: "handleMaturity"; assetId: string; choice: "rollover" | "toCash"; termMonths?: number }
  // --- loan / lifecycle
  | { type: "takeLoan"; goalId: string; productId: string; principal: number; termMonths: number; payForGoal?: boolean }
  | { type: "startRepayment"; goalId: string }
  | { type: "repay"; loanId: string }
  | { type: "prepay"; loanId: string; amount: number }
  | { type: "completeEarly"; goalId: string }
  | { type: "extend"; goalId: string; newTargetDate: ISODate }
  | { type: "reduceTarget"; goalId: string; newTargetAmount: number }
  | { type: "pauseGoal"; goalId: string }
  | { type: "resumeGoal"; goalId: string }
  | { type: "closeGoal"; goalId: string }
  | { type: "reorderPriorities"; goalIds: string[] }
  // --- agent / ui
  | { type: "dismissSuggestion"; id: string }
  | { type: "toast/push"; message: string; tone?: ToastTone }
  | { type: "toast/dismiss"; id: string }
  | NavAction;

export type PreviewActionType = PreviewAction["type"];
