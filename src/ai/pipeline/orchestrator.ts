/**
 * The assistant pipeline. Runs the mandated order: intent → scope → required-data
 * → tool-use loop (deterministic tools) → validate → answer. The LLM chooses
 * tools; the server executes them and feeds results back. The final narrative is
 * validated (numeric grounding + safety) BEFORE it reaches the user, so no
 * fabricated number is ever shown. LLM failure degrades to the offline template.
 */

import type { LlmClient, LlmContentBlock, LlmMessage } from "@/ai/llm/types";
import type { AiContext } from "@/ai/server/load-financials";
import type { ToolResult } from "@/ai/tools/types";
import { getTool, toolSchemas } from "@/ai/tools/registry";
import { classifyIntent, type Intent } from "./intent";
import { ensureScopes } from "./scope-check";
import { checkRequiredData } from "./required-data";
import { buildSystemPrompt } from "./system-prompt";
import { validateNumeric, validateSafety } from "./validator";
import { offlineAnswer } from "./fallback";
import { buildChart } from "./whatif-chart";
import { recordAuditEvent, newRequestId } from "@/ai/audit/log";
import { CONSENT_VERSION } from "@/lib/consent";
import type { AssistantEvent } from "./events";
import type { AiDraftAudit } from "@/ai/audit/types";
import { isTransferDraftingEnabled } from "@/ai/config";
import { isTransferConfirmation, runActionPipeline } from "./action-pipeline";

/** Mutable per-request trace, finalized into an audit event. */
interface RequestTrace {
  toolsUsed: string[];
  degraded: boolean;
  numericOk: boolean;
  safetyOk: boolean;
  /** Present only for assisted-transfer requests (metadata only). */
  draft?: AiDraftAudit;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunInput {
  messages: ChatMessage[];
  ctx: AiContext;
  client: LlmClient | null;
  maxSteps?: number;
}

const ACTION_REFUSAL =
  "Xin lỗi, bản này chỉ đọc và giải thích số liệu — mình không hỗ trợ chuyển tiền hay thực hiện giao dịch. " +
  "Bạn hãy dùng luồng chuyển tiền chính thức của MSB nhé.";

function* chunkText(text: string): Generator<string> {
  const words = text.split(/(\s+)/);
  let buf = "";
  for (const w of words) {
    buf += w;
    if (buf.length >= 24) {
      yield buf;
      buf = "";
    }
  }
  if (buf) yield buf;
}

function* emitOffline(intent: Intent, ctx: AiContext, reason: string, trace: RequestTrace): Generator<AssistantEvent> {
  trace.degraded = true;
  const ans = offlineAnswer(intent, ctx);
  yield { type: "degraded", reason };
  if (ans.sources.length > 0) yield { type: "tool", name: "offline", sources: ans.sources };
  yield { type: "text", delta: ans.lines.join(" ") };
  yield { type: "done", degraded: true };
}

async function* llmLoop(input: RunInput, trace: RequestTrace): AsyncGenerator<AssistantEvent> {
  const { ctx, client } = input;
  if (!client) return;
  const system = buildSystemPrompt(ctx);
  const tools = toolSchemas();
  const convo: LlmMessage[] = input.messages
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: [{ type: "text" as const, text: m.content }] }));

  const toolResults: ToolResult[] = [];
  let finalText = "";
  const maxSteps = input.maxSteps ?? 4;

  for (let step = 0; step < maxSteps; step++) {
    let turnText = "";
    const toolUses: { id: string; name: string; input: unknown }[] = [];
    for await (const ev of client.streamMessage({ system, messages: convo, tools })) {
      if (ev.type === "text") turnText += ev.delta;
      else if (ev.type === "tool_use") toolUses.push({ id: ev.id, name: ev.name, input: ev.input });
      else if (ev.type === "error") throw new Error(ev.message);
    }

    const assistantBlocks: LlmContentBlock[] = [];
    if (turnText) assistantBlocks.push({ type: "text", text: turnText });
    for (const tu of toolUses) assistantBlocks.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
    convo.push({ role: "assistant", content: assistantBlocks });

    if (toolUses.length === 0) {
      finalText = turnText;
      break;
    }

    const resultBlocks: LlmContentBlock[] = [];
    for (const tu of toolUses) {
      const tool = getTool(tu.name);
      if (!tool) {
        resultBlocks.push({ type: "tool_result", toolUseId: tu.id, content: `Công cụ ${tu.name} không tồn tại.`, isError: true });
        continue;
      }
      const outcome = tool.handler(tu.input, ctx);
      if (!outcome.ok) {
        resultBlocks.push({ type: "tool_result", toolUseId: tu.id, content: outcome.error, isError: true });
        continue;
      }
      toolResults.push(outcome.result);
      trace.toolsUsed.push(tu.name);
      yield { type: "tool", name: tu.name, sources: outcome.result.sources, period: outcome.result.period };
      const chart = buildChart(tu.name, outcome.result.data);
      if (chart) yield { type: "chart", chart };
      resultBlocks.push({ type: "tool_result", toolUseId: tu.id, content: JSON.stringify(outcome.result.data) });
    }
    convo.push({ role: "user", content: resultBlocks });
  }

  const safety = validateSafety(finalText);
  const numeric = validateNumeric(finalText, toolResults);
  trace.numericOk = numeric.ok;
  trace.safetyOk = safety.ok;
  if (!finalText.trim() || !safety.ok || !numeric.ok) {
    const safe = !finalText.trim()
      ? "Mình chưa có đủ dữ liệu để trả lời chắc chắn câu này."
      : "Mình chưa chắc về một vài con số nên tạm thời không đưa ra để tránh sai sót. Bạn thử hỏi lại cụ thể hơn nhé.";
    yield { type: "text", delta: safe };
    yield { type: "done" };
    return;
  }

  for (const chunk of chunkText(finalText)) yield { type: "text", delta: chunk };
  yield { type: "done" };
}

export async function* runAssistant(input: RunInput): AsyncGenerator<AssistantEvent> {
  const { ctx } = input;
  const requestId = newRequestId();
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
  const intent = classifyIntent(lastUser?.content ?? "");
  const trace: RequestTrace = { toolsUsed: [], degraded: false, numericOk: true, safetyOk: true };
  // Enter the draft pipeline for a fresh transfer OR a follow-up confirmation.
  const isAction = intent.kind === "action_transfer" || isTransferConfirmation(input.messages);
  let auditIntent = intent.kind;

  try {
    const scope = ensureScopes(intent, ctx.scopes);
    if (!scope.ok) {
      yield { type: "refusal", reason: "scope" };
      yield { type: "text", delta: scope.reason! };
      yield { type: "done" };
      return;
    }

    if (isAction) {
      auditIntent = "action_transfer";
      if (!isTransferDraftingEnabled()) {
        // Flag off: preserve the original hard refusal (no draft, no tool call).
        trace.draft = { riskFlags: [], thresholdHit: false, outcome: "refused" };
        yield { type: "refusal", reason: "action_not_supported" };
        yield { type: "text", delta: ACTION_REFUSAL };
        yield { type: "done" };
        return;
      }
      // Draft-only: prepares a reviewable TransferDraft, never executes/confirms.
      yield* runActionPipeline({ messages: input.messages, ctx }, trace, requestId);
      return;
    }

    const req = checkRequiredData(intent, ctx);
    if (!req.ok) {
      yield { type: "refusal", reason: "insufficient_data" };
      yield { type: "text", delta: req.reason! };
      yield { type: "done" };
      return;
    }

    if (!input.client) {
      yield* emitOffline(intent, ctx, "no_provider", trace);
      return;
    }

    try {
      yield* llmLoop(input, trace);
    } catch {
      yield* emitOffline(intent, ctx, "llm_error", trace);
    }
  } finally {
    recordAuditEvent({
      requestId,
      consentVersion: CONSENT_VERSION,
      dataScope: ctx.scopes,
      intent: auditIntent,
      toolsUsed: trace.toolsUsed,
      validation: { numericOk: trace.numericOk, safetyOk: trace.safetyOk },
      degraded: trace.degraded,
      createdAt: new Date().toISOString(),
      ...(trace.draft ? { draft: trace.draft } : {}),
    });
  }
}
