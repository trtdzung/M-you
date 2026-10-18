/**
 * Standing instructions the customer gives M-You about HOW to talk to them —
 * style, address, and a little personal/financial context — never a financial
 * fact and never a channel to change what the assistant is allowed to do.
 *
 * This is the one domain model the AI facade's own request shape never saw
 * before (plan 261013): `POST /chat` only ever took `{message, user_id,
 * thread_id?}` (`agent_backend_docs/api.md`). `pfm` delivers these preferences
 * by folding them into the hidden preamble of the customer's first message of a
 * fresh thread (`src/lib/agent-preference-seed.ts`) — no Agent-repo change
 * needed, and the agent still only ever reads free text, same as any other turn.
 *
 * Every field is OPTIONAL and independently unset — `null` for the three
 * enums ("chưa chọn", never a guessed default) and `""` for the four free-text
 * fields (never a fabricated sentence). A persona with no saved row reads back
 * as every field unset (`EMPTY_AGENT_PREFERENCES`).
 *
 * `riskAppetite` only shapes HOW savings/investing examples are framed in
 * conversation (e.g. a goal what-if's tone) — it is explicitly NOT a KYC risk
 * profile and grants no new capability: the AI product contract's "explicitly
 * out of scope" list (no guaranteed-return language, no specific price
 * prediction, no advice presented as certain) is unaffected by this field.
 */
export type ResponseLength = "concise" | "balanced" | "detailed";
export type AgentTone = "friendly" | "formal" | "playful";
export type RiskAppetite = "cautious" | "balanced" | "aggressive";

export interface AgentPreferences {
  responseLength: ResponseLength | null;
  tone: AgentTone | null;
  riskAppetite: RiskAppetite | null;
  /** How M-You should address the customer, e.g. "chị Lan". `""` = unset. */
  addressAs: string;
  /**
   * Personal interests + self-reported financial habits, ONE free-text field
   * (e.g. "Tôi thích đầu tư cổ phiếu, tần suất theo dõi là 2 ngày 1 lần").
   * `""` = unset.
   */
  about: string;
  /** Anything else, free text. `""` = unset. */
  notes: string;
}

export const RESPONSE_LENGTHS: readonly ResponseLength[] = ["concise", "balanced", "detailed"];
export const AGENT_TONES: readonly AgentTone[] = ["friendly", "formal", "playful"];
export const RISK_APPETITES: readonly RiskAppetite[] = ["cautious", "balanced", "aggressive"];

/** Character caps enforced both client-side (the form) and server-side (the write door). */
export const AGENT_PREFERENCES_MAX = {
  addressAs: 60,
  about: 500,
  notes: 600,
} as const;

export const EMPTY_AGENT_PREFERENCES: AgentPreferences = {
  responseLength: null,
  tone: null,
  riskAppetite: null,
  addressAs: "",
  about: "",
  notes: "",
};
