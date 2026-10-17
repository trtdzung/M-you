/** Types for the agent's goal-coach/v1 contract, plus a guard: pfm never trusts the agent's shape. */

export type CoachSlotName = "name" | "target_amount" | "horizon" | "flexibility" | "opening_amount";
export type CoachFlexibility = "fixed" | "flexible";
export type CoachStatus = "draft" | "need_info" | "out_of_scope";
export type CoachMessageCode =
  | "draft_ready"
  | "need_name"
  | "need_amount"
  | "need_horizon"
  | "need_flexibility"
  | "need_opening"
  | "not_a_goal"
  | "amount_unclear"
  | "horizon_unclear";

export type CoachHorizon = { months: number } | { target_month: string };

export interface CoachAnswer {
  slot: CoachSlotName;
  value: string;
  source: "option" | "text";
}

export interface CoachQuestion {
  slot: CoachSlotName;
  code: CoachMessageCode;
  text: string;
  options: { label: string; value: string }[];
  allow_free_text: boolean;
}

export interface CoachDraft {
  name: string;
  target_amount: number;
  horizon: CoachHorizon;
  flexibility: CoachFlexibility;
  opening_amount: number;
}

export interface CoachResponse {
  version: "goal-coach/v1";
  request_id: string;
  status: CoachStatus;
  slots: Record<string, unknown>;
  draft: CoachDraft | null;
  question: CoachQuestion | null;
  message_code: CoachMessageCode;
}

export const COACH_REQUEST_MAX = 500;
export const COACH_ANSWERS_MAX = 6;
export const COACH_ANSWER_VALUE_MAX = 200;

const SLOTS: readonly string[] = ["name", "target_amount", "horizon", "flexibility", "opening_amount"];
const CODES: readonly string[] = [
  "draft_ready", "need_name", "need_amount", "need_horizon", "need_flexibility",
  "need_opening", "not_a_goal", "amount_unclear", "horizon_unclear",
];
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

function isQuestion(x: unknown): x is CoachQuestion {
  return (
    isObj(x) &&
    SLOTS.includes(x.slot as string) &&
    CODES.includes(x.code as string) &&
    isStr(x.text) &&
    typeof x.allow_free_text === "boolean" &&
    Array.isArray(x.options) &&
    x.options.every((o) => isObj(o) && isStr(o.label) && isStr(o.value))
  );
}

/** True only when `x` has the exact goal-coach/v1 shape for its `status`. */
export function isCoachResponse(x: unknown): x is CoachResponse {
  if (!isObj(x)) return false;
  if (x.version !== "goal-coach/v1" || !isStr(x.request_id) || !isObj(x.slots)) return false;
  if (!CODES.includes(x.message_code as string)) return false;
  if (x.status === "draft") return isDraft(x.draft) && x.question === null;
  if (x.status === "need_info") return x.draft === null && isQuestion(x.question);
  if (x.status === "out_of_scope") return x.draft === null && x.question === null;
  return false;
}
