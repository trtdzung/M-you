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
  nav: { stack: ScreenEntry[] };
  toasts: Toast[];
  /** Monotonic counter for deterministic business ids. Only business actions move it (same as the server). */
  seq: number;
  /** Client-only counter for screen keys and toast ids; never sent to the server. */
  navSeq?: number;
  /** Id of the goal most recently created by `createGoal` (wizard reads it). */
  lastCreatedGoalId?: string;
}

/** The data part of a scenario (no nav / toasts / dismissals). */
export type WorldState = Omit<PreviewState, "nav" | "navSeq" | "toasts" | "lastCreatedGoalId">;

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

