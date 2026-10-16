/**
 * Client for the real M-Your agent, proxied through `src/app/api/agent/chat`
 * (same-origin — the client never sees `AGENT_API_KEY`/Auth0 credentials,
 * see `route.ts`). `UiPayload` is a discriminated union the agent may return
 * alongside `answer` — `ChartUi` (Feature 2) and `TransferFormUi` (Feature 3)
 * today, `{ type: string }` as a catch-all for future/unsupported types
 * (Feature 4 adds its own variant here without changing this file's other
 * exports).
 */

import { CATEGORY_BY_ID } from "@/domain/models";

const PROXY_PATH = "/api/agent/chat";

export interface ChartUi {
  type: "chart";
  chart_type: "bar" | "line" | "pie";
  title: string;
  labels: string[];
  series: { name: string; data: number[] }[];
}

/**
 * A proposal to transfer money to a recipient already in the customer's
 * saved beneficiaries (`GET /api/beneficiaries` — see
 * `backend_docs/pfm-read-api.md`). The agent never invents a recipient: it
 * only returns `beneficiary_id`, which the UI resolves against `pfm`'s own
 * beneficiaries data for the real name/account number/bank (never trusting
 * the agent to relay those directly — invariant #3, no fabricated accounts).
 */
export interface TransferFormUi {
  type: "transfer_form";
  beneficiary_id: string;
  amount: number;
  note: string;
  category: string;
}

export type UiPayload = ChartUi | TransferFormUi | { type: string } | null;

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

/**
 * True only for a `ui.type === "transfer_form"` payload with all 4 required
 * fields present and well-typed, `amount > 0`, `category` a known expense
 * category id. Same reliability posture as `isChartUi`: the agent's `ui`
 * field is model-generated, so a malformed payload never throws — it just
 * falls back to showing `answer` alone. This only validates SHAPE —
 * `beneficiary_id` matching a real saved beneficiary is checked separately
 * by `AgentTransferFormCard` (it needs the live beneficiaries list to do so).
 */
export function isTransferFormUi(ui: UiPayload | null | undefined): ui is TransferFormUi {
  if (!ui || ui.type !== "transfer_form") return false;
  const f = ui as Partial<TransferFormUi>;
  return (
    typeof f.beneficiary_id === "string" &&
    f.beneficiary_id.trim() !== "" &&
    typeof f.amount === "number" &&
    Number.isFinite(f.amount) &&
    f.amount > 0 &&
    typeof f.note === "string" &&
    typeof f.category === "string" &&
    CATEGORY_BY_ID[f.category]?.kind === "expense"
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
