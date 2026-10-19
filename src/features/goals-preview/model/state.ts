import type { PreviewAction } from "../store/actions";
import type { ScreenEntry, ScreenId, ScreenParams } from "./screens";
import type {
  Asset,
  CustomerProfile,
  Goal,
  GoalAccount,
  GoalTxn,
  Loan,
  MarketState,
  SimClock,
  Toast,
} from "./types";

/** Whole simulated world. Serialised to localStorage as-is. */
export interface PreviewState {
  version: 1;
  scenarioId: string;
  customer: CustomerProfile;
  goals: Goal[];
  accounts: GoalAccount[];
  txns: GoalTxn[];
  assets: Asset[];
  loans: Loan[];
  clock: SimClock;
  market: MarketState;
  dismissedSuggestionIds: string[];
  nav: { stack: ScreenEntry[] };
  toasts: Toast[];
  /** Monotonic counter for deterministic ids. */
  seq: number;
  /** Id of the goal most recently created by `createGoal` (wizard reads it). */
  lastCreatedGoalId?: string;
}

/** The data part of a scenario (no nav / toasts / dismissals). */
export type WorldState = Omit<PreviewState, "nav" | "toasts" | "dismissedSuggestionIds" | "lastCreatedGoalId">;

export interface ScenarioJump {
  screen: ScreenId;
  params?: ScreenParams;
}

export interface Scenario {
  id: string;
  /** Short number shown in the flow map ("1".."13", "0" for demo, "—" for empty). */
  code: string;
  title: string;
  description: string;
  /** What to look at in this scenario (bullet hints for the team). */
  highlights: string[];
  jumpTo?: ScenarioJump;
  build: () => WorldState;
}

// ---------------------------------------------------------------- agent suggestions

export type SuggestionKind =
  | "idle_cash"
  | "fund_drop"
  | "maturity"
  | "standing_order_failed"
  | "behind_plan"
  | "early_achieved"
  | "due_soon"
  | "missed"
  | "overdue"
  | "prepay"
  | "revalue_asset"
  | "priority_conflict"
  | "insufficient_data"
  | "loan_blocked"
  | "generic";

export interface SuggestionAction {
  label: string;
  /** Navigate (push) to a screen. */
  nav?: { screen: ScreenId; params?: ScreenParams };
  /** Or (and) dispatch a store action. */
  action?: PreviewAction;
  primary?: boolean;
}

export interface AgentSuggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  body: string;
  goalId?: string;
  tone?: "info" | "warning" | "success";
  actions: SuggestionAction[];
}
