import "server-only";

/**
 * Scam Shield orchestrator: one loop for every trigger. Event → context →
 * signals → scenario (rule decides) → frequency check → intervention (spec
 * wording, shown at once) → the agent may enrich it later (`enrich`, A04) →
 * the customer's choice is logged and becomes the next event.
 */

import { recoveryState } from "./recovery";
import { readProfile } from "./profile-store";
import { engineNow, readEngineClock } from "./clock";
import type { SecurityEvent } from "./event-types";
import { eventsSince, recordEvent } from "./events";
import {
  expireOpen, findOpenByDedupe, getIntervention, insertIntervention, markAnswered, markShown, openInterventions, shownHistory,
  type NewIntervention, type StoredContext,
} from "./intervention-store";
import { startEmergency, lockEmergency } from "./emergency";
import { actionFor } from "./actions";
import type { EvaluateTrigger, Intervention, InterventionTarget, RespondAction } from "./intervention-types";
import { SCENARIO_COPY, type ScenarioId } from "./scenario-copy";
import { frequencyAllows, resolveMoment, resolveTransfer, type MomentContext } from "./scenarios";
import { buildIncomingContext, buildTransferContext, type TransferReview } from "./signal-context";
import { accountKey, accountLastFour, computeIncomingSignals, computeSignals, type Signal } from "./signals";

const MINUTE_MS = 60 * 1000;

export type EvaluateInput = {
  review?: TransferReview;
  /** incoming_credit: the credited transaction (anchors BT4/BT5 on its row). */
  txnId?: string;
  /** Client facts the server cannot know yet (BT1 account age, BT2 score). */
  moment?: Pick<MomentContext, "accountAgeDays" | "score">;
  /** transfer_success: the recipient just paid. */
  recipient?: { last4: string; bank: string };
};

/** Hook for the fraud agent (A04): enrich an intervention's copy after it is stored. */
export function enrich(_cif: string, _interventionId: string): void {
  // No agent yet: the spec wording stays.
}

const evidenceOf = (signals: Signal[]) => signals.map(s => ({ code: s.code, evidence: s.evidence }));

function store(input: Omit<NewIntervention, "createdAt">, now: number): Intervention {
  const existing = input.dedupeKey ? findOpenByDedupe(input.cif, input.dedupeKey) : null;
  if (existing) return existing;
  const created = insertIntervention({ ...input, createdAt: now });
  enrich(input.cif, created.id);
  return created;
}

/** Transfer about to be confirmed (or the recipient just entered: T2 only). */
function evaluateTransfer(cif: string, review: TransferReview, target: "transfer-confirm" | "recipient-entry" | "fd-settle"): Intervention[] {
  const now = engineNow(cif).getTime();
  const ctx = buildTransferContext(cif, review);
  let signals = computeSignals(ctx);
  if (target === "recipient-entry") signals = signals.filter(s => s.code === "T2");
  const last4 = accountLastFour(review.recipientAccount);
  const key = last4 ? accountKey(last4, review.recipientBank) : null;
  // DH1: «Không lặp với cùng người nhận đã xác nhận trong 30 ngày» — drop T1b when it already was.
  if (signals.some(s => s.code === "T1b") && !frequencyAllows("DH1", shownHistory(cif), now, key)) {
    signals = signals.filter(s => s.code !== "T1b");
  }
  const result = resolveTransfer(signals);
  if (!result.primary || !result.copy || !result.surface) {
    expireOpen(cif, target);
    return [];
  }
  const dedupeKey = `${target}|${result.primary}|${review.amount}|${key ?? review.recipientAccount}|${(review.memo ?? "").trim()}`;
  const context: StoredContext = {
    scenarios: result.scenarios, classify: result.classify, evidence: evidenceOf(signals), key,
    facts: { holdEligible: result.holdEligible, amount: review.amount, recipientName: review.recipientName, recipientLast4: last4 ?? "", recipientBank: review.recipientBank ?? "" },
  };
  const before = findOpenByDedupe(cif, dedupeKey);
  const intervention = store({
    cif, scenario: result.primary, level: result.level, surface: result.surface,
    // On the FD screen the red popup is drawn by InterventionHost.
    target, dedupeKey, context, copy: result.copy, countdownSec: result.countdownSec,
  }, now);
  // DH5 «push người thân»: once per new warning, never the amount or recipient.
  if (!before && result.scenarios.includes("DH5")) notifyFamily(cif, "DH5", now);
  expireOpen(cif, target, intervention.id);
  return [intervention];
}

function momentTarget(id: ScenarioId, txnId?: string): InterventionTarget {
  if (id === "BT1") return "home-transfer";
  if (id === "BT2" || id === "SC4") return "hub-gauge";
  if (id === "BT3" || id === "SC3") return "home-balance";
  if ((id === "BT4" || id === "BT5") && txnId) return `txn:${txnId}`;
  if (id === "BT6") return "transfer-success";
  return "global";
}

function evaluateMoment(cif: string, trigger: MomentContext["trigger"], input: EvaluateInput): Intervention[] {
  const now = engineNow(cif).getTime();
  const profile = readProfile(cif);
  if (!profile.aiProtect) return [];
  const ctx: MomentContext = { now, trigger, ...input.moment };
  if (trigger === "hub_open") {
    const recovery = recoveryState(cif);
    if (recovery.incidentAt !== null) {
      ctx.recoveryStepsLeft = recovery.steps.filter(done => !done).length;
      if (ctx.recoveryStepsLeft) ctx.score = null;
      else expireOpen(cif, "hub-gauge");
    }
  }
  // BT1: account age from the engine state when the app did not send it.
  if (ctx.accountAgeDays == null) {
    const opened = readEngineClock(cif).accountOpenedAt;
    ctx.accountAgeDays = opened == null ? null : Math.max(0, Math.floor((now - opened) / (24 * 60 * MINUTE_MS)));
  }
  let incomingSignals: Signal[] = [];
  if (trigger === "incoming_credit") {
    const incoming = buildIncomingContext(cif);
    const latest = (eventsSince(cif, now - 5 * MINUTE_MS, ["incoming_credit"]) as SecurityEvent<"incoming_credit">[]).at(-1);
    ctx.credit = latest ? { amount: latest.payload.amount, kind: latest.payload.kind } : null;
    // BT4/BT5 speak about the credit that just arrived: T7a for its sender, T7b for that credit alone.
    const latestKey = latest ? accountKey(latest.payload.senderLast4, latest.payload.senderBank) : null;
    const bait = computeIncomingSignals(incoming).filter(s => s.code === "T7a" && s.facts.senderKey === latestKey);
    const large = latest
      ? computeIncomingSignals({ ...incoming, credits: (incoming.credits ?? []).filter(c => c.at === latest.at && accountKey(c.sender.last4, c.sender.bank) === latestKey) })
        .filter(s => s.code === "T7b")
      : [];
    incomingSignals = [...bait, ...large];
    ctx.hasActiveEmergencyContact = profile.emergencyContacts.some(c => c.status === "active" || c.status === "removing");
    ctx.incomingSignals = incomingSignals;
  }
  if (trigger === "transfer_success" && input.recipient) {
    const key = accountKey(input.recipient.last4, input.recipient.bank);
    const sameRecent = (eventsSince(cif, now - 5 * MINUTE_MS, ["transfer_out"]) as SecurityEvent<"transfer_out">[])
      .filter(e => accountKey(e.payload.recipientLast4, e.payload.recipientBank) === key);
    ctx.repeatRecipientKey = sameRecent.length >= 2 ? key : null;
  }
  const history = shownHistory(cif);
  const out: Intervention[] = [];
  for (const moment of resolveMoment(ctx)) {
    if (!frequencyAllows(moment.scenario, history, now, moment.key)) continue;
    const copy = SCENARIO_COPY[moment.scenario];
    const target = momentTarget(moment.scenario, input.txnId);
    out.push(store({
      cif, scenario: moment.scenario, level: copy.level, surface: copy.surface, target,
      dedupeKey: `${target}|${moment.scenario}|${moment.key ?? ""}|${input.txnId ?? ""}`,
      context: { scenarios: [moment.scenario], classify: false, evidence: evidenceOf(incomingSignals), key: moment.key },
      copy: moment.copy, countdownSec: null,
    }, now));
  }
  return out;
}

function notifyFamily(cif: string, scenario: string, at: number): void {
  const contacts = readProfile(cif).emergencyContacts.filter(c => c.status === "active" || c.status === "removing");
  if (!contacts.length) return;
  recordEvent(cif, "family_push", {
    message: "M-You, trợ lý AI của MSB, vừa cảnh báo một giao dịch có dấu hiệu lừa đảo của người thân bạn. Hãy gọi hỏi thăm họ ngay (giả lập).",
    scenario, contactIds: contacts.map(c => c.id),
  }, at);
}

/** Run the engine for one trigger; returns the interventions now open because of it. */
export function evaluate(cif: string, trigger: EvaluateTrigger, input: EvaluateInput = {}): Intervention[] {
  if (trigger === "transfer_review" || trigger === "recipient_entered" || trigger === "fd_settle_review") {
    if (!input.review) return [];
    const target = trigger === "transfer_review" ? "transfer-confirm" : trigger === "recipient_entered" ? "recipient-entry" : "fd-settle";
    if (!readProfile(cif).aiProtect) {
      expireOpen(cif, target);
      return [];
    }
    return evaluateTransfer(cif, input.review, target);
  }
  return evaluateMoment(cif, trigger, input);
}

export { actionFor };

export function listOpen(cif: string, target?: string): Intervention[] {
  return openInterventions(cif, target);
}

export function shown(cif: string, id: string): boolean {
  const intervention = getIntervention(cif, id);
  if (!intervention || !markShown(cif, id, engineNow(cif).getTime())) return false;
  if (intervention.status === "pending") recordEvent(cif, "intervention_shown", { interventionId: id, scenario: intervention.scenario });
  return true;
}

/** Log the customer's choice; returns the action for the app, or null when the intervention is closed. */
export function respond(cif: string, id: string, choice: string): RespondAction | null {
  const intervention = getIntervention(cif, id);
  if (!intervention) return null;
  const action = intervention.scenario === "SC4" && choice === SCENARIO_COPY.SC4.chips[0]
    ? { kind: "navigate" as const, href: ["/settings/password", "/settings/devices", "/settings/anti-phishing", "/settings/emergency-contacts"][Math.max(0, recoveryState(cif).steps.findIndex(done => !done))] }
    : actionFor(choice);
  const entering = intervention.scenario === "SC1" && action.kind === "emergency" && choice !== "Khóa ngay";
  const now = engineNow(cif).getTime();
  if (!(entering ? shown(cif, id) : markAnswered(cif, id, choice, now))) return null;
  recordEvent(cif, "intervention_answered", { interventionId: id, scenario: intervention.scenario, choice });
  if (intervention.scenario === "SC1" && choice === SCENARIO_COPY.SC1.chips[0]) lockEmergency(cif);
  else if (action.kind === "emergency" && intervention.scenario !== "SC1") startEmergency(cif);
  return action;
}
