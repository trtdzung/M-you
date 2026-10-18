// Shape + safety rules for the agent's narration (goal-coach narrate). pfm never trusts the agent's text.
import type { PlanId, Verdict } from "./analysis-types";

export const PLACEHOLDERS = [
  "monthly_needed", "surplus", "target_amount", "new_date", "new_amount", "months", "cut_amount",
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export const VERDICTS: readonly Verdict[] = ["feasible", "stretch", "not_feasible", "unknown"];
export const PLAN_IDS: readonly PlanId[] = ["keep_deadline", "extend_deadline", "reduce_amount"];
export const DIALOGUE_ACTIONS = [
  "ask_purpose", "ask_amount", "ask_horizon", "ask_opening",
  "reflect", "present_plans", "confirm", "handle_objection",
] as const;
export type DialogueAction = (typeof DIALOGUE_ACTIONS)[number];

export const NARRATION_MAX_LEN = 280;
/** Hard deadline for the LLM sentences; after it the local template stays. */
export const NARRATION_DEADLINE_MS = 2000;

export type NarrateInput = (
  | { mode: "explain"; verdict: Verdict; planIds: PlanId[]; categoryNames?: string[]; goalName?: string | null }
  | { mode: "converse"; action: DialogueAction; goalName?: string | null }
) & { conversationId?: string | null };

export interface NarrationBlock {
  id: string;
  text: string;
}

/** `local` = use the built-in templates (flag, timeout, bad or missing answer). */
export type NarrateResult = { source: "llm" | "template"; blocks: NarrationBlock[] } | { source: "local" };

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

/** True when the sentence has no digit, only known placeholders and a sane length. */
export function isSafeNarration(text: unknown): text is string {
  if (typeof text !== "string" || text.length === 0 || text.length > NARRATION_MAX_LEN) return false;
  if (/\d/.test(text) || /[\n\r<>]/.test(text)) return false;
  const names = [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
  if (names.some((n) => !(PLACEHOLDERS as readonly string[]).includes(n))) return false;
  return !/[{}]/.test(text.replace(PLACEHOLDER_RE, ""));
}
