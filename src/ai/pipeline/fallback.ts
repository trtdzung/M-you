/**
 * Offline fallback. When the LLM is unavailable (no provider/key, error, timeout)
 * the assistant still answers from the deterministic templates (the old rule-based
 * assistant) so the "AI works offline" guarantee holds. Answers are flagged
 * degraded by the caller.
 */

import { answerPrompt, type AssistantAnswer } from "@/insights/assistant";
import type { AiContext } from "@/ai/server/load-financials";
import type { Intent, IntentKind } from "./intent";

const INTENT_TO_PROMPT: Partial<Record<IntentKind, string>> = {
  explain_month: "explain_month",
  top_category: "top_category",
  upcoming: "upcoming",
  networth: "networth",
};

const CAPABILITY_HINT =
  "Mình có thể giúp bạn xem dòng tiền, chi tiêu theo danh mục, tài sản/nợ và mục tiêu tiết kiệm.";

export function offlineAnswer(intent: Intent, ctx: AiContext): AssistantAnswer {
  if (intent.kind === "smalltalk") {
    return { lines: [`Chào bạn 👋 ${CAPABILITY_HINT} Bạn muốn bắt đầu từ đâu?`], sources: [] };
  }

  const promptId = INTENT_TO_PROMPT[intent.kind];
  if (promptId) return answerPrompt(promptId, ctx.financials);

  if (intent.kind === "whatif_goal" || intent.kind === "whatif_debt") {
    return {
      lines: [
        "Hiện mình đang ở chế độ ngoại tuyến nên chưa chạy mô phỏng chi tiết được.",
        "Bạn thử lại sau, hoặc xem mục tiêu/khoản nợ trong phần Tài sản nhé.",
      ],
      sources: [],
    };
  }

  // Unknown: don't guess — ask what they want rather than dumping a full report.
  return { lines: [`Mình chưa rõ ý bạn. ${CAPABILITY_HINT} Bạn muốn xem phần nào?`], sources: [] };
}
