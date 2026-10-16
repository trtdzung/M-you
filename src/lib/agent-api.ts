/**
 * Client for the real M-Your agent, proxied through `src/app/api/agent/chat`
 * (same-origin — the client never sees `AGENT_API_KEY`/Auth0 credentials,
 * see `route.ts`). `UiPayload` is a minimal placeholder discriminated union
 * for now (Feature 0 scope, see `todo.md`) — Features 2–4 each extend it
 * with their own `type` (`"chart"` / `"transfer_form"` / `"create_jar"` /
 * `"edit_jar"`) without changing this file's exported surface.
 */

const PROXY_PATH = "/api/agent/chat";

export type UiPayload = { type: string } | null;

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
