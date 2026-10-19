import "server-only";

/**
 * Read-only snapshot for the test-tool Engine inspector and the simulated
 * family inbox. Does not call the fraud agent or write events.
 */

import type { SecurityEvent } from "./event-types";
import { eventsSince } from "./events";
import { fraudAgentEnabled } from "./fraud-switch";
import { openWithTrace, type TraceStep } from "./intervention-store";
import type { AgentStatus, CopySource } from "./intervention-types";
import { readProfile } from "./profile-store";
import type { ScenarioLevel } from "./scenario-copy";
import { resolveTransfer } from "./scenarios";
import { buildTransferContext, type TransferReview } from "./signal-context";
import { computeSignals } from "./signals";

const FAMILY_SCENARIOS = new Set(["DH5", "SC1", "HOLD"]);
const DRAFT_TARGETS = new Set(["transfer-confirm", "recipient-entry", "fd-settle"]);

export type InspectSignal = { code: string; evidence: string };
export type InspectDraft = {
  signals: InspectSignal[];
  level: ScenarioLevel | null;
  scenario: string | null;
  agentStatus: AgentStatus;
  source: CopySource;
  trace: TraceStep[];
};
export type InspectPending = {
  id: string;
  scenario: string;
  level: string;
  target: string;
  status: string;
  agentStatus: AgentStatus;
  source: CopySource;
};
export type FamilyNote = { id: string; at: number; scenario: string; message: string; contacts: string[] };
export type InspectSnapshot = { draft: InspectDraft | null; pending: InspectPending[]; inbox: FamilyNote[] };

/** Drop balances, long account numbers, and transaction detail before a relative sees the note. */
function forFamily(message: string): string {
  const cleaned = message
    .replace(/số dư[^.]*(?:\.|$)/gi, "")
    .replace(/\b\d{6,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "Có một sự việc cần người thân biết (giả lập).";
}

function familyInbox(cif: string): FamilyNote[] {
  const names = new Map(readProfile(cif).emergencyContacts.map(contact => [contact.id, contact.name]));
  const events = eventsSince(cif, 0, ["family_push"]) as SecurityEvent<"family_push">[];
  const notes: FamilyNote[] = [];
  for (const event of events) {
    const scenario = event.payload.scenario ?? "";
    const contactIds = event.payload.contactIds ?? [];
    if (!FAMILY_SCENARIOS.has(scenario) && contactIds.length === 0) continue;
    if (scenario === "SC3") continue;
    notes.push({
      id: event.id,
      at: event.at,
      scenario: scenario || "—",
      message: forFamily(event.payload.message),
      contacts: contactIds.length ? contactIds.map(id => names.get(id) ?? "Người thân khẩn cấp") : ["Người thân khẩn cấp"],
    });
  }
  return notes.reverse();
}

/** Signals and the open warning for the latest draft, plus family notes already sent. */
export function inspectEngine(cif: string, review?: TransferReview): InspectSnapshot {
  const open = openWithTrace(cif);
  const pending: InspectPending[] = open.map(item => ({
    id: item.id, scenario: item.scenario, level: item.level, target: item.target, status: item.status, agentStatus: item.agentStatus, source: item.source,
  }));
  const inbox = familyInbox(cif);
  const drafts = open.filter(item => DRAFT_TARGETS.has(item.target));
  if (!review) {
    const latest = drafts[0];
    if (!latest) return { draft: null, pending, inbox };
    return {
      draft: { signals: latest.evidence, level: latest.level, scenario: latest.scenario, agentStatus: latest.agentStatus, source: latest.source, trace: latest.trace },
      pending, inbox,
    };
  }
  const signals = computeSignals(buildTransferContext(cif, review));
  const resolved = resolveTransfer(signals);
  const match = drafts.find(item => item.scenario === resolved.primary) ?? drafts[0];
  const agentOff = !fraudAgentEnabled();
  return {
    draft: {
      signals: signals.map(signal => ({ code: signal.code, evidence: signal.evidence })),
      level: resolved.level,
      scenario: resolved.primary,
      agentStatus: match?.agentStatus ?? (agentOff ? "off" : "none"),
      source: match?.source ?? "rule",
      trace: match?.trace ?? [],
    },
    pending, inbox,
  };
}
