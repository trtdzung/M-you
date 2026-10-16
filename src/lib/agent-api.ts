/**
 * Client for the real M-Your agent, proxied through `src/app/api/agent/chat`
 * (same-origin — the client never sees `AGENT_API_KEY`/Auth0 credentials,
 * see `route.ts`). `UiPayload` is a discriminated union the agent may return
 * alongside `answer` — `ChartUi` today (Feature 2), `{ type: string }` as a
 * catch-all for future/unsupported types (Features 3–4 add their own variant
 * here without changing this file's other exports).
 */

const PROXY_PATH = "/api/agent/chat";

export interface ChartUi {
  type: "chart";
  chart_type: "bar" | "line" | "pie";
  title: string;
  labels: string[];
  series: { name: string; data: number[] }[];
}

export type UiPayload = ChartUi | { type: string } | null;

/**
 * True only for a `ui.type === "chart"` payload that is actually safe to
 * render: `chart_type` is one of the 3 supported kinds, and every series'
 * `data` length matches `labels` length. The agent's `ui` field is model-
 * generated and not schema-enforced end to end (see chart-visualization.md)
 * — never throws, so a malformed/unsupported payload just falls back to
 * showing `answer` alone.
 */
export function isChartUi(ui: UiPayload | null | undefined): ui is ChartUi {
  if (!ui || ui.type !== "chart") return false;
  const c = ui as Partial<ChartUi>;
  if (typeof c.title !== "string") return false;
  if (!Array.isArray(c.labels) || !c.labels.every((l) => typeof l === "string")) return false;
  if (c.chart_type !== "bar" && c.chart_type !== "line" && c.chart_type !== "pie") return false;
  if (!Array.isArray(c.series) || c.series.length === 0) return false;
  return c.series.every(
    (s) =>
      s &&
      typeof s.name === "string" &&
      Array.isArray(s.data) &&
      s.data.length === c.labels!.length &&
      s.data.every((n) => typeof n === "number"),
  );
}

export interface ChatResponse {
  answer: string;
  thread_id: string;
  ui?: UiPayload;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  ui: UiPayload;
}

export interface ChatHistoryResponse {
  thread_id: string;
  messages: HistoryMessage[];
}

async function readJsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    throw new Error(`Agent API error ${res.status}`);
  }
  return res.json();
}

export async function sendChatMessage(message: string, cif: string): Promise<ChatResponse> {
  const res = await fetch(PROXY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, user_id: cif }),
  });
  return readJsonOrThrow(res) as Promise<ChatResponse>;
}

export async function getChatHistory(cif: string): Promise<ChatHistoryResponse> {
  const res = await fetch(`${PROXY_PATH}?user_id=${encodeURIComponent(cif)}`);
  return readJsonOrThrow(res) as Promise<ChatHistoryResponse>;
}

export async function deleteChatHistory(cif: string): Promise<void> {
  const res = await fetch(`${PROXY_PATH}?user_id=${encodeURIComponent(cif)}`, { method: "DELETE" });
  await readJsonOrThrow(res);
}
