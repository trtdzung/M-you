/**
 * Assisted transfer drafting pipeline (Level 3, EPIC-13) — draft-only.
 *
 * ORDER (docs/ARCHITECTURE.md §Action pipeline): parse fields deterministically
 * → resolve recipient from REAL records → validate → risk (threshold + fraud) →
 * in-chat re-confirm gate → prepare a `TransferDraft` (Tier B) → hand off.
 *
 * SAFETY (CLAUDE.md #2/#3): there is NO execute/confirm/submit/schedule/OTP path
 * anywhere in this module. The agent's authority ends at a reviewable draft;
 * money only moves when the human confirms + authenticates in the MSB flow,
 * which this facade cannot invoke. Fields are parsed in code (never by the LLM)
 * and recipient account numbers are never fabricated.
 */

import type { TransferRiskFlag } from "@/domain/models";
import type { AiContext } from "@/ai/server/load-financials";
import type { AiDraftAudit } from "@/ai/audit/types";
import { formatVnd } from "@/lib/format";
import { findRecipient, prepareTransferDraft, type ResolvedRecipient } from "@/ai/tools/draft-tools";
import { LARGE_TRANSFER_VND, TRANSFER_THRESHOLD_VND } from "@/ai/config";
import { classifyIntent } from "./intent";
import { parseAction } from "./action-parse";
import type { AssistantEvent, TransferDraftView } from "./events";
import type { ChatMessage } from "./orchestrator";

/** Minimal, mutable trace the pipeline writes draft audit metadata into. */
export interface ActionTrace {
  draft?: AiDraftAudit;
}

export interface ActionInput {
  messages: ChatMessage[];
  ctx: AiContext;
}

// No \b anchors: ASCII word boundaries do not work around Vietnamese letters.
const AFFIRM_RE = /(đồng\s*ý|xác\s*nhận|đúng(?:\s*rồi)?|chốt|tiếp\s*tục|vâng|okay|(?:^|\s)ok(?:$|\s)|(?:^|\s)yes(?:$|\s))/i;

function userMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.role === "user");
}

function isTransferRequest(text: string): boolean {
  return classifyIntent(text).kind === "action_transfer";
}

/**
 * True when the latest user message is an affirmation of the transfer request in
 * the IMMEDIATELY preceding user turn (the second leg of a threshold/fraud
 * re-confirmation). A fresh transfer request is NOT a confirmation.
 *
 * SAFETY: adjacency is required on purpose. Scanning the whole history would let
 * an unrelated later "ok" (e.g. agreeing to a spending breakdown two turns after
 * abandoning a transfer) silently resurrect a stale, over-threshold draft that
 * the user never re-confirmed in context — defeating PFM-132/133.
 */
export function isTransferConfirmation(messages: ChatMessage[]): boolean {
  const users = userMessages(messages);
  if (users.length < 2) return false;
  const last = users[users.length - 1].content;
  if (isTransferRequest(last)) return false;
  if (!AFFIRM_RE.test(last)) return false;
  return isTransferRequest(users[users.length - 2].content);
}

function* clarify(trace: ActionTrace, question: string): Generator<AssistantEvent> {
  if (!trace.draft) trace.draft = { riskFlags: [], thresholdHit: false, outcome: "clarify" };
  yield { type: "clarify", question };
  yield { type: "done" };
}

function buildReconfirmSummary(
  recipient: ResolvedRecipient,
  amount: number,
  thresholdHit: boolean,
  fraud: boolean,
): string {
  const parts = [
    `Bạn muốn chuyển ${formatVnd(amount)} cho ${recipient.recipientName} (${recipient.recipientAccountMasked}).`,
  ];
  if (thresholdHit) {
    parts.push(`Số tiền này vượt ngưỡng ${formatVnd(TRANSFER_THRESHOLD_VND)} nên cần bạn xác nhận lại.`);
  }
  if (fraud) {
    parts.push(
      "Lưu ý: đây là người nhận mới, số tiền lớn và có yếu tố gấp — hãy chậm lại, chắc chắn bạn biết rõ người nhận để tránh lừa đảo.",
    );
  }
  parts.push('Nếu đúng, trả lời "đồng ý" để mình soạn bản nháp cho bạn tự xác nhận. Mình không tự chuyển tiền.');
  return parts.join(" ");
}

function sourceLabel(institution: string, type: string): string {
  const kind = type === "current" ? "thanh toán" : type === "savings" ? "tiết kiệm" : type;
  return `${institution} · ${kind}`;
}

/**
 * Run the draft pipeline for the current turn. `requestId` ties the draft to its
 * audit event. Yields clarify/reconfirm/draft events; never executes anything.
 */
export function* runActionPipeline(
  input: ActionInput,
  trace: ActionTrace,
  requestId: string,
): Generator<AssistantEvent> {
  const { ctx } = input;
  const users = userMessages(input.messages);
  const confirmed = isTransferConfirmation(input.messages);
  const requestText = confirmed
    ? [...users].reverse().find((m) => isTransferRequest(m.content))?.content ?? ""
    : users[users.length - 1]?.content ?? "";
  const parsed = parseAction(requestText);

  // 1. Recipient — resolve from real records only.
  if (!parsed.recipientHint) {
    yield* clarify(trace, "Bạn muốn chuyển cho ai? Cho mình biết tên người nhận (đã lưu) hoặc số tài khoản nhé.");
    return;
  }
  const found = findRecipient(parsed.recipientHint, ctx);
  if (found.status === "not_found") {
    yield* clarify(
      trace,
      `Mình không tìm thấy người nhận "${parsed.recipientHint}" trong danh bạ hay lịch sử giao dịch. ` +
        "Bạn kiểm tra lại tên, hoặc nhập số tài khoản giúp mình nhé — mình không tự tạo số tài khoản.",
    );
    return;
  }
  if (found.status === "ambiguous") {
    const list = found.candidates.map((c) => `${c.name} (${c.masked})`).join("; ");
    yield* clarify(trace, `Có nhiều người nhận khớp: ${list}. Bạn muốn chuyển cho ai?`);
    return;
  }
  const recipient = found.recipient;

  // 2. Amount.
  if (parsed.amount === null || parsed.amount <= 0) {
    yield* clarify(trace, `Bạn muốn chuyển cho ${recipient.recipientName} bao nhiêu tiền?`);
    return;
  }

  // 3. Source account (default the payment/current account).
  const source = ctx.raw.accounts.find((a) => a.type === "current") ?? ctx.raw.accounts[0];
  if (!source) {
    yield* clarify(trace, "Mình chưa thấy tài khoản nguồn để chuyển. Bạn kiểm tra lại tài khoản nhé.");
    return;
  }

  // 4. Risk assessment (deterministic — injection text cannot disable these).
  const riskFlags: TransferRiskFlag[] = [];
  const thresholdHit = parsed.amount >= TRANSFER_THRESHOLD_VND;
  if (thresholdHit) riskFlags.push("over_threshold");
  if (recipient.isNewPayee) riskFlags.push("new_payee");
  if (parsed.urgency) riskFlags.push("urgency_language");
  const fraudCheckpoint = recipient.isNewPayee && parsed.amount >= LARGE_TRANSFER_VND && parsed.urgency;
  const requiresReconfirm = thresholdHit || fraudCheckpoint;

  // 5. Re-confirm gate — stop before drafting until the human confirms in-chat.
  if (requiresReconfirm && !confirmed) {
    trace.draft = { riskFlags, thresholdHit, outcome: "reconfirm" };
    yield {
      type: "reconfirm",
      reason: fraudCheckpoint ? "fraud_checkpoint" : "over_threshold",
      summary: buildReconfirmSummary(recipient, parsed.amount, thresholdHit, fraudCheckpoint),
      riskFlags,
    };
    yield { type: "done" };
    return;
  }

  // 6. Prepare the draft (Tier B) — assemble + validate only. NEVER executes.
  const prepared = prepareTransferDraft(
    {
      recipient,
      amount: parsed.amount,
      memo: parsed.memo,
      sourceAccountId: source.id,
      riskFlags,
      thresholdHit,
      requiresReconfirm,
      requestId,
    },
    ctx,
  );
  if (!prepared.ok) {
    yield* clarify(trace, `Mình chưa tạo được bản nháp: ${prepared.error}`);
    return;
  }

  const view: TransferDraftView = {
    id: prepared.draft.id,
    recipientName: prepared.draft.recipientName,
    recipientAccountMasked: prepared.draft.recipientAccountMasked,
    recipientSource: prepared.draft.recipientSource,
    sourceAccountLabel: sourceLabel(source.institution, source.type),
    amount: prepared.draft.amount,
    currency: prepared.draft.currency,
    memo: prepared.draft.memo,
    riskFlags: prepared.draft.riskFlags,
    thresholdHit: prepared.draft.thresholdHit,
  };
  trace.draft = { riskFlags, thresholdHit, outcome: "draft" };
  const note = riskFlags.length
    ? "Mình đã soạn sẵn bản nháp bên dưới. Hãy kiểm tra kỹ từng thông tin rồi tự xác nhận trong luồng MSB — mình không tự chuyển tiền."
    : "Mình đã soạn sẵn bản nháp bên dưới để bạn xem lại và tự xác nhận. Mình không thực hiện giao dịch thay bạn.";
  yield { type: "draft", draft: view, note };
  yield { type: "done" };
}
