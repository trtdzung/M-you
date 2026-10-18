// Types shared by engine, server, API and UI of the goals feature.

export type GoalFlexibility = "fixed" | "flexible";
export type GoalStatus = "active" | "paused" | "archived";
export type GoalLedgerKind = "deposit" | "withdraw";

/** Persisted goal row (camelCase of `user_goals`). Amounts are integer VND. */
export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  /** "YYYY-MM-DD". */
  targetDate: string;
  flexibility: GoalFlexibility;
  /** null = not set (not the same as 0). */
  monthlyContribution: number | null;
  status: GoalStatus;
  /** "YYYY-MM-DD" (VN) on which a timed pause ends and the goal resumes; null = no timed pause. */
  pausedUntil: string | null;
  jarId: string | null;
  createdAt: string;
  updatedAt: string;
  source: "self_reported";
}

/** Persisted ledger row (camelCase of `user_goal_ledger`). */
export interface GoalLedgerEntry {
  id: string;
  goalId: string;
  kind: GoalLedgerKind;
  amount: number;
  /** Commitment phrase when withdrawing. */
  note: string | null;
  createdAt: string;
  source: "self_reported";
}

export interface GoalCreateInput {
  name: string;
  targetAmount: number;
  targetDate: string;
  flexibility: GoalFlexibility;
  monthlyContribution: number | null;
  /** Amount already saved; recorded as the first deposit. */
  openingAmount: number | null;
  /** Idempotency key (1-80 chars); a repeated key for the same cif returns the existing goal. */
  requestKey?: string;
}

export interface GoalUpdateInput {
  name?: string;
  targetAmount?: number;
  targetDate?: string;
  flexibility?: GoalFlexibility;
  monthlyContribution?: number | null;
  status?: GoalStatus;
  /** With `status: "paused"`: resume automatically after this many months (1-12). Omitted = until resumed. */
  pauseMonths?: number;
}

export interface LedgerEntryInput {
  kind: GoalLedgerKind;
  amount: number;
  note: string | null;
}

/** Field name -> Vietnamese error message. */
export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  | { ok: true; value: T; errors: FieldErrors }
  | { ok: false; value: null; errors: FieldErrors };

export type GoalProgressState =
  | "on_track"
  | "ahead"
  | "slightly_behind"
  | "off_track";

export interface GoalProgress {
  /** 0-100, one decimal. */
  percent: number;
  milestone: 0 | 25 | 50 | 75 | 100;
  state: GoalProgressState;
  expectedAmount: number;
}

export type FeasibilityResult = "met" | "feasible" | "infeasible" | "unknown";

export interface GoalFeasibility {
  monthsLeft: number;
  requiredMonthly: number;
  surplus: number | "unknown";
  result: FeasibilityResult;
  source: "estimated" | "self_reported";
}

export type Lever =
  | { kind: "extend_date"; newDate: string; months: number }
  | { kind: "reduce_amount"; newTarget: number }
  | {
      kind: "cut_category";
      categoryId: string;
      categoryLabel: string | null;
      cutPerMonth: number;
      /** false = cutting this category alone is not enough. */
      enough: boolean;
    };

/** Goal enriched with derived numbers; what list/detail screens render. */
export interface SavingsGoalView extends SavingsGoal {
  currentAmount: number;
  progress: GoalProgress;
  feasibility: GoalFeasibility;
}

/** Body of the what-if feasibility check. */
export interface FeasibilityRequest {
  targetAmount: number;
  targetDate: string;
  currentAmount?: number;
  flexibility?: GoalFlexibility;
  estimatedMonthlySurplus?: number;
}

export interface FeasibilityResponse {
  surplus: number | "unknown";
  feasibility: GoalFeasibility;
  levers: Lever[];
}

/** Partially filled request, as built from a half-typed form. */
export type FeasibilityInput = Partial<Omit<FeasibilityRequest, "targetAmount">> & {
  targetAmount?: number | null;
};
