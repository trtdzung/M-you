/**
 * Client-side reader for the /api/assistant NDJSON stream. Parses each
 * newline-delimited `AssistantEvent` and hands it to `onEvent` as it arrives,
 * so the UI can render text/chips/charts incrementally. Pure fetch + streams;
 * no key ever lives here (the server route holds it).
 */

import type { AssistantEvent } from "@/ai/pipeline/events";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamRequest {
  personaId: string;
  month: string;
  messages: ChatTurn[];
  scopes: string[];
}

export async function streamAssistant(
  req: StreamRequest,
  onEvent: (event: AssistantEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    onEvent({ type: "error", message: "Không kết nối được máy chủ trợ lý." });
    return;
  }

  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: `Máy chủ trả về lỗi (${res.status}).` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (chunk: string) => {
    const line = chunk.trim();
    if (!line) return;
    try {
      onEvent(JSON.parse(line) as AssistantEvent);
    } catch {
      // ignore malformed line
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      flush(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  }
  flush(buffer);
}
