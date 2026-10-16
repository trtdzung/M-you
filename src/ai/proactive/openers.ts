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
