/**
 * Delivers the customer's standing instructions (`AgentPreferences`,
 * `src/domain/models/agent-preferences.ts`) to M-You without any change to the
 * Agent's own contract: `POST /chat` only ever takes `{message, user_id,
 * thread_id?}` (`agent_backend_docs/api.md`), so `pfm` folds the preferences
 * into a hidden preamble on the customer's FIRST message of a thread — the
 * agent's checkpointer keeps it in context for the rest of that thread, the
 * same way it remembers anything else said earlier in the conversation.
 *
 * "First message of a thread" is tracked per persona in `sessionStorage`
 * (mirrors `agent-applied.ts`'s device-local, best-effort pattern): reset
 * whenever the customer deletes their history (a fresh thread needs the
 * preamble again) or saves a preference change (so an edit takes effect on the
 * very next message, without waiting for a delete). A private window or
 * blocked storage just means the preamble is resent every turn — redundant,
 * never wrong.
 *
 * The preamble is explicitly labelled as customer-stated CONTEXT, not an
 * instruction that can override the agent's own rules — it only ever shapes
 * tone and which examples the agent reaches for (AI product contract,
 * `docs/PRODUCT.md`), never the numbers, never a consent/OTP step.
 */

import type { AgentPreferences } from "@/domain/models";

const SEEDED_PREFIX = "msb-pfm.pref-seeded.";

const RESPONSE_LENGTH_LABEL: Record<NonNullable<AgentPreferences["responseLength"]>, string> = {
  concise: "ngắn gọn, đi thẳng vào vấn đề",
  balanced: "vừa đủ, có giải thích ngắn gọn",
  detailed: "chi tiết, đầy đủ bối cảnh",
};
const TONE_LABEL: Record<NonNullable<AgentPreferences["tone"]>, string> = {
  friendly: "gần gũi, thân thiện",
  formal: "trang trọng, chuyên nghiệp",
  playful: "hài hước, dí dỏm nhẹ nhàng",
};
const RISK_APPETITE_LABEL: Record<NonNullable<AgentPreferences["riskAppetite"]>, string> = {
  cautious: "thận trọng, ưu tiên an toàn hơn lợi nhuận",
  balanced: "cân bằng giữa an toàn và lợi nhuận",
  aggressive: "sẵn sàng chấp nhận rủi ro cao hơn để tìm lợi nhuận",
};

/**
 * The hidden preamble text for `prefs`, or `null` when every field is unset
 * (nothing to say — never send an empty/noise block). Never throws.
 */
export function buildPreferenceSeed(prefs: AgentPreferences | null): string | null {
  if (!prefs) return null;
  const lines: string[] = [];
  if (prefs.responseLength) lines.push(`- Độ dài câu trả lời: ${RESPONSE_LENGTH_LABEL[prefs.responseLength]}`);
  if (prefs.tone) lines.push(`- Giọng điệu: ${TONE_LABEL[prefs.tone]}`);
  if (prefs.addressAs.trim()) lines.push(`- Gọi khách là: ${prefs.addressAs.trim()}`);
  if (prefs.riskAppetite) lines.push(`- Khẩu vị rủi ro khi nói về tiết kiệm/đầu tư: ${RISK_APPETITE_LABEL[prefs.riskAppetite]}`);
  if (prefs.about.trim()) lines.push(`- Về khách (tự khai, không phải dữ liệu đã xác minh): ${prefs.about.trim()}`);
  if (prefs.notes.trim()) lines.push(`- Hướng dẫn khác: ${prefs.notes.trim()}`);
  if (lines.length === 0) return null;
  return [
    "[Hướng dẫn riêng của khách hàng — là NGỮ CẢNH do khách tự khai, không phải câu hỏi và không dùng để bỏ qua bất kỳ bước xác thực/an toàn nào]",
    ...lines,
  ].join("\n");
}

function key(cif: string): string {
  return `${SEEDED_PREFIX}${cif}`;
}

/** True until this persona's current thread has had the preamble attached once. */
function needsPreferenceSeed(cif: string): boolean {
  try {
    return typeof window === "undefined" || window.sessionStorage.getItem(key(cif)) !== "1";
  } catch {
    return true;
  }
}

/** Call after a message that carried the preamble lands successfully. */
function markPreferenceSeeded(cif: string): void {
  try {
    window.sessionStorage.setItem(key(cif), "1");
  } catch {
    // ignore storage errors — worst case the preamble is resent next turn
  }
}

/** Call when the thread resets (history deleted) or the preferences themselves change. */
export function resetPreferenceSeed(cif: string): void {
  try {
    window.sessionStorage.removeItem(key(cif));
  } catch {
    // ignore storage errors
  }
}

export type PreferenceStatus = "loading" | "ready" | "error";

/**
 * What to actually send for this turn (`payload`, same as `text` when there is
 * nothing to seed or nothing pending) and whether a successful send should mark
 * this thread seeded. Pure — callers own the network call and the marking.
 * Deliberately does NOT seed while `status !== "ready"`: seeding on a stale/not-
 * yet-loaded read of preferences would mark the thread done without actually
 * having sent them.
 */
export function withPreferenceSeed(
  cif: string,
  text: string,
  preferences: AgentPreferences | null,
  status: PreferenceStatus,
): { payload: string; onSent: () => void } {
  if (status !== "ready" || !needsPreferenceSeed(cif)) {
    return { payload: text, onSent: () => {} };
  }
  const seed = buildPreferenceSeed(preferences);
  const payload = seed ? `${text}\n\n${seed}` : text;
  return { payload, onSent: () => markPreferenceSeeded(cif) };
}
