import type { PreviewState, WorldState } from "../model/state";
import type { ScreenId, ScreenParams } from "../model/screens";
import type {
  DeclaredAssetCategory,
  GoalFlexibility,
  GoalTemplate,
  ISODate,
  RiskProfile,
  ToastTone,
  ValueSource,
} from "../model/types";

/** Tài sản tự khai thêm vào mục tiêu (dùng cho `addAsset` và `CreateGoalInput.assets`). */
export interface DeclaredAssetInput {
  name: string;
  category: DeclaredAssetCategory;
  value: number;
  countPercent: number;
  valuationDate?: ISODate;
  source?: ValueSource;
  instrumentId?: string;
  quantity?: number;
  accrual?: { principal: number; ratePa: number; startDate: ISODate; maturityDate?: ISODate };
  institution?: string;
}

export interface CreateGoalInput {
  name: string;
  template: GoalTemplate;
  targetAmount: number;
  targetDate: ISODate;
  flexibility: GoalFlexibility;
  /** Logo cho mục tiêu tuỳ chỉnh; mặc định theo `template`. */
  icon?: GoalTemplate;
  /** Default: after every existing saving goal. */
  priority?: number;
  note?: string;
  /** Nạp ban đầu từ tài khoản chính khi tạo (tài khoản mục tiêu được mở cùng lúc). */
  initialDeposit?: number;
  /** Trích tự động hằng tháng bật sẵn khi tạo. */
  standingOrder?: { amount: number; dayOfMonth: number };
  /** Tài sản có sẵn gắn vào mục tiêu ngay khi tạo. */
  assets?: DeclaredAssetInput[];
}

export type NavAction =
  | { type: "nav/params"; params: ScreenParams }
  | { type: "nav/push"; screen: ScreenId; params?: ScreenParams }
  | { type: "nav/pop"; count?: number }
  /** Quay lại một màn và gộp `params` vào màn đó (trả kết quả cho màn trước). */
  | { type: "nav/popWith"; params: ScreenParams }
  | { type: "nav/replace"; screen: ScreenId; params?: ScreenParams }
  /** Stack becomes [screen] (default GoalList). */
  | { type: "nav/reset"; screen?: ScreenId; params?: ScreenParams }
  /** Pop until `screen` is on top (no-op if absent). */
  | { type: "nav/popTo"; screen: ScreenId };

/** Tài sản mà tiền mặt của mục tiêu dùng để mua khi sang giai đoạn vay: tài sản cố định đang có, hoặc tài sản mới. */
export type LoanPurchase = { assetId: string } | { name: string; category: DeclaredAssetCategory; value: number };

export type PreviewAction =
  // --- scenario / sim
  | { type: "loadScenario"; scenarioId: string; jump?: boolean }
  | { type: "reset" }
  | { type: "hydrate"; state: PreviewState }
  /**
   * Server world replaces the data part; nav, toasts and dismissals are kept. `goalIdMap` (temporary → server
   * goal id) and `unsavedGoalIds` come from the createGoal responses: nav params and lastCreatedGoalId follow the
   * map, screens pointing at an unsaved goal are dropped.
   */
  | { type: "world/sync"; world: WorldState; goalIdMap?: Record<string, string>; unsavedGoalIds?: string[] }
  | { type: "advanceTime"; days: number }
  | { type: "setRiskProfile"; profile: RiskProfile }
  // --- create
  | { type: "createGoal"; input: CreateGoalInput }
  // --- cash
  | { type: "deposit"; goalId: string; amount: number; note?: string }
  | { type: "withdraw"; goalId: string; amount: number; note?: string; emergency?: boolean }
  | { type: "setStandingOrder"; goalId: string; amount: number; dayOfMonth: number; active?: boolean }
  | { type: "runStandingOrderNow"; goalId: string }
  // --- loan reservation (before the due date)
  | { type: "reserveLoan"; goalId: string; productId: string; principal: number; termMonths: number }
  | { type: "cancelReservedLoan"; goalId: string }
  // --- assets / invest
  | ({ type: "addAsset"; goalId: string } & DeclaredAssetInput)
  | { type: "revalueAsset"; assetId: string; value: number; countPercent?: number; valuationDate?: ISODate }
  | { type: "removeAsset"; assetId: string }
  /** Outside market asset (gold, stock, fund): the customer bought or sold, value follows the price. */
  | { type: "setAssetQuantity"; assetId: string; quantity: number }
  | { type: "invest"; goalId: string; productId: string; amount: number; termMonths?: number }
  /** Liquid: sells `fraction` (default 1) at current value. Fixed: records `proceeds` (default declared value). */
  | { type: "sellAsset"; assetId: string; fraction?: number; proceeds?: number }
  | { type: "handleMaturity"; assetId: string; choice: "rollover" | "toCash"; termMonths?: number }
  // --- loan / lifecycle
  | { type: "takeLoan"; goalId: string; productId: string; principal: number; termMonths: number; purchase?: LoanPurchase; settlement?: "now" | "next" }
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
  | { type: "toast/push"; message: string; tone?: ToastTone }
  | { type: "toast/dismiss"; id: string }
  | NavAction;

export type PreviewActionType = PreviewAction["type"];
