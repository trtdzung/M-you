/**
 * Proactive conversation openers. Reuses the existing rule-based detectors to
 * surface the single most important insight as a seed message — read-only and
 * bounded (no new autonomy, at most one opener). If nothing is notable, returns
 * null and the chat starts empty.
 */

import type { Financials } from "@/domain/engine/finance-compose";
import type { Insight } from "@/domain/models";
import { runDetectors } from "@/insights/run";

export interface AssistantOpener {
  text: string;
  sources: string[];
}

/**
 * DEFERRED (3-tab reformat): these seeds were surfaced by the retired Trợ lý tab
 * (PFM-070). Their only consumer, `SuggestedPrompts.tsx`, is unmounted — the live
 * `/assistant` empty-state uses `Composer`'s starters instead (red-team #4). Kept
 * for reference alongside that component; re-wire or delete both in a cleanup
 * pass (tracked in plans/project-backlog.md). NOT proactive autonomy (the single
 * proactive opener stays bounded to `buildOpener`); each still aligns with a real
 * `classifyIntent` capability.
 */
export const SUGGESTED_PROMPTS: readonly string[] = [
  "Tháng này tiền của tôi đi đâu?",
  "Danh mục nào tôi chi nhiều nhất?",
  "Bao giờ tôi đạt được mục tiêu tiết kiệm?",
  "Giá trị ròng của tôi hiện tại là bao nhiêu?",
  "Sắp tới tôi có khoản nào đến hạn?",
];

/** Turn one insight into an opener bubble (grounded by the detector's facts). */
export function openerFromInsight(insight: Insight): AssistantOpener {
  return {
    text: `${insight.title}. ${insight.explanation}`,
    sources: ["Phát hiện tự động theo quy tắc từ dữ liệu của bạn."],
  };
}

/** Build the highest-severity opener for a period, or null if nothing notable. */
export function buildOpener(financials: Financials): AssistantOpener | null {
  const top = runDetectors(financials)[0];
  return top ? openerFromInsight(top) : null;
}
