// What the Scam Shield engine shows the customer, and what the app may send
// back. Shared by the server (orchestrator) and the client (InterventionHost).

import type { ScenarioId, ScenarioLevel, Surface } from "./scenario-copy";

export type InterventionStatus = "pending" | "shown" | "answered" | "expired";
export type CopySource = "rule" | "agent";
export type AgentStatus = "none" | "pending" | "ready" | "failed" | "off";

export type InterventionCopy = { message: string; question: string | null; chips: string[]; emphasis: string[] };

/** Where it shows: a screen key or an anchor (`[data-shield-anchor]`). */
export type InterventionTarget =
  | "transfer-confirm" | "recipient-entry" | "home-transfer" | "home-balance" | "hub-gauge"
  | "transfer-success" | "fd-settle" | "global" | `txn:${string}`;

export type Intervention = {
  id: string;
  scenario: ScenarioId;
  /** Every scenario that matched; the first is the one shown. */
  scenarios: ScenarioId[];
  level: ScenarioLevel;
  surface: Surface;
  target: InterventionTarget;
  status: InterventionStatus;
  /** Agent copy when ready, else the spec wording. */
  copy: InterventionCopy;
  source: CopySource;
  agentStatus: AgentStatus;
  countdownSec: number | null;
  classify: boolean;
  /** Signal evidence the decision rests on (for the inspector and the agent). */
  evidence: { code: string; evidence: string }[];
  createdAt: number;
  choice: string | null;
};

export type EvaluateTrigger =
  | "transfer_review" | "recipient_entered" | "incoming_credit" | "app_open"
  | "transfer_screen_open" | "hub_open" | "transfer_success";

/** What the app should do after a choice; the rule engine decides, never the agent. */
export type RespondAction =
  | { kind: "proceed" }
  | { kind: "stop" }
  | { kind: "dismiss" }
  | { kind: "callback" }
  | { kind: "emergency" }
  | { kind: "case" }
  | { kind: "trust" }
  | { kind: "navigate"; href: string };
