/** Types for the agent's goal-coach/v1 contract, plus a guard: pfm never trusts the agent's shape. */

export type CoachSlotName = "name" | "target_amount" | "horizon" | "flexibility" | "opening_amount";
export type CoachFlexibility = "fixed" | "flexible";
export type CoachStatus = "draft" | "need_info" | "out_of_scope" | "adjust";
export type CoachMessageCode =
  | "draft_ready"
  | "need_name"
  | "need_amount"
  | "need_horizon"
  | "need_flexibility"
  | "need_opening"
  | "not_a_goal"
  | "amount_unclear"
  | "horizon_unclear"
  | "adjust_ready"
  | "adjust_unclear";

export type CoachHorizon = { months: number } | { target_month: string };

export interface CoachAnswer {
  slot: CoachSlotName;
  value: string;
  source: "option" | "text";
}

export interface CoachHint {
  code: "far_beyond" | "no_surplus";
  months?: number | null;
}

export interface CoachQuestion {
  slot: CoachSlotName;
  code: CoachMessageCode;
  text: string;
  options: { label: string; value: string }[];
  allow_free_text: boolean;
  /** Early warning decided by the agent's code; the wording lives in `ui/copy.ts`. */
  hint?: CoachHint | null;
}

export interface CoachDraft {
  name: string;
  target_amount: number;
  horizon: CoachHorizon;
  flexibility: CoachFlexibility;
  opening_amount: number;
}

export type CoachAdjustKind = "extend_months" | "reduce_amount_to" | "raise_saving_to" | "use_savings_amount";

/** Normalised edit of the current draft: months added, new target, monthly saving, or VND taken from savings. */
export interface CoachAdjustment {
  kind: CoachAdjustKind;
  value: number;
  evidence?: string | null;
}

/** Sent with a request when the customer edits the draft they are looking at. */
export interface CoachCurrentDraft {
  target_amount: number;
  opening_amount: number;
  months?: number | null;
}

export interface CoachResponse {
  version: "goal-coach/v1";
  request_id: string;
  status: CoachStatus;
  slots: Record<string, unknown>;
  draft: CoachDraft | null;
  question: CoachQuestion | null;
  message_code: CoachMessageCode;
  adjustment?: CoachAdjustment | null;
}

export const COACH_REQUEST_MAX = 500;
export const COACH_ANSWERS_MAX = 6;
export const COACH_ANSWER_VALUE_MAX = 200;

const SLOTS: readonly string[] = ["name", "target_amount", "horizon", "flexibility", "opening_amount"];
const CODES: readonly string[] = [
  "draft_ready", "need_name", "need_amount", "need_horizon", "need_flexibility",
  "need_opening", "not_a_goal", "amount_unclear", "horizon_unclear", "adjust_ready", "adjust_unclear",
];
const ADJUST_KINDS: readonly string[] = ["extend_months", "reduce_amount_to", "raise_saving_to", "use_savings_amount"];
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x !== "";
const isPosInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) > 0;
const isNonNegInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

function isHorizon(x: unknown): x is CoachHorizon {
  if (!isObj(x)) return false;
  const keys = Object.keys(x);
  if (keys.length !== 1) return false;
  if ("months" in x) return isPosInt(x.months) && x.months <= 600;
  return typeof x.target_month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(x.target_month);
}

function isDraft(x: unknown): x is CoachDraft {
  return (
    isObj(x) &&
    isStr(x.name) &&
    isPosInt(x.target_amount) &&
    isHorizon(x.horizon) &&
    (x.flexibility === "fixed" || x.flexibility === "flexible") &&
    isNonNegInt(x.opening_amount)
  );
}

function isAdjustment(x: unknown): x is CoachAdjustment {
  return isObj(x) && ADJUST_KINDS.includes(x.kind as string) && isPosInt(x.value) && (x.evidence == null || typeof x.evidence === "string");
}

function isHint(x: unknown): x is CoachHint {
  return isObj(x) && (x.code === "far_beyond" || x.code === "no_surplus") && (x.months == null || isPosInt(x.months));
}

function isQuestion(x: unknown): x is CoachQuestion {
  return (
    isObj(x) &&
    SLOTS.includes(x.slot as string) &&
    CODES.includes(x.code as string) &&
    isStr(x.text) &&
    typeof x.allow_free_text === "boolean" &&
    (x.hint == null || isHint(x.hint)) &&
    Array.isArray(x.options) &&
    x.options.every((o) => isObj(o) && isStr(o.label) && isStr(o.value))
  );
}

/** True only when `x` has the exact goal-coach/v1 shape for its `status`. */
export function isCoachResponse(x: unknown): x is CoachResponse {
  if (!isObj(x)) return false;
  if (x.version !== "goal-coach/v1" || !isStr(x.request_id) || !isObj(x.slots)) return false;
  if (!CODES.includes(x.message_code as string)) return false;
  const noAdjustment = x.adjustment === undefined || x.adjustment === null;
  if (x.status === "draft") return isDraft(x.draft) && x.question === null && noAdjustment;
  if (x.status === "need_info") return x.draft === null && isQuestion(x.question) && noAdjustment;
  if (x.status === "out_of_scope") return x.draft === null && x.question === null && noAdjustment;
  if (x.status === "adjust") return x.draft === null && x.question === null && isAdjustment(x.adjustment);
  return false;
}
