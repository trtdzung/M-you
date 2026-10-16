/**
 * OpenAI-compatible adapter — for any provider that speaks the OpenAI Chat
 * Completions API (VNG GreenNode AI Platform: Qwen, GLM, …). Reads key/model/URL
 * from server-side env only. Maps the neutral message/tool shapes to the OpenAI
 * request body and normalizes its SSE stream back to `LlmStreamEvent`. Uses fetch
 * so no extra SDK dependency is needed. Numbers never originate here.
 */

import type {
  LlmClient,
  LlmContentBlock,
  LlmMessage,
  LlmStreamEvent,
  LlmStreamParams,
  LlmTool,
} from "./types";

const DEFAULT_BASE_URL = "https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1";
const DEFAULT_MODEL = "qwen/qwen3.6-flash";
// Qwen3 is a reasoning model — `reasoning_content` shares this budget with the
// visible answer, so keep enough headroom that the final narrative isn't cut off.
const DEFAULT_MAX_TOKENS = 2048;

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

/** Flatten neutral blocks into OpenAI messages: tool_result → its own `tool` message. */
function toOpenAiMessages(system: string, messages: LlmMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];

  for (const m of messages) {
    const text = m.content
      .filter((b): b is Extract<LlmContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");

    const toolResults = m.content.filter(
      (b): b is Extract<LlmContentBlock, { type: "tool_result" }> => b.type === "tool_result",
    );
    // OpenAI carries tool output as standalone `tool` messages, not user blocks.
    for (const r of toolResults) {
      out.push({ role: "tool", tool_call_id: r.toolUseId, content: r.content });
    }

    if (m.role === "assistant") {
      const toolCalls = m.content
        .filter((b): b is Extract<LlmContentBlock, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      if (text || toolCalls.length > 0) {
        out.push({
          role: "assistant",
          content: text || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      }
    } else if (text) {
      out.push({ role: "user", content: text });
    }
  }
  return out;
}

function toOpenAiTools(tools: LlmTool[] | undefined) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

function mapFinishReason(reason: string | null | undefined): LlmStreamEvent & { type: "done" } {
  const map: Record<string, "end" | "tool_use" | "max_tokens" | "other"> = {
    stop: "end",
    tool_calls: "tool_use",
    function_call: "tool_use",
    length: "max_tokens",
  };
  return { type: "done", stopReason: (reason && map[reason]) || "other" };
}

/** Iterate complete SSE `data:` payloads from a fetch body stream. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith("data:")) yield tail.slice(5).trim();
}

export function createOpenAiCompatibleClient(): LlmClient {
  const apiKey = process.env.AI_PLATFORM_API_KEY;
  if (!apiKey) throw new Error("AI_PLATFORM_API_KEY chưa được cấu hình (server-side).");
  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  return {
    provider: "openai-compatible",
    model,
    async *streamMessage(params: LlmStreamParams): AsyncIterable<LlmStreamEvent> {
      // Accumulate streamed tool-call fragments per index (args arrive piecemeal).
      const toolCalls = new Map<number, { id: string; name: string; args: string }>();
      let finishReason: string | null = null;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: toOpenAiMessages(params.system, params.messages),
          tools: toOpenAiTools(params.tools),
          max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: params.temperature ?? 0.2,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        yield { type: "error", message: `LLM HTTP ${res.status}: ${detail.slice(0, 300)}` };
        return;
      }

      for await (const data of sseData(res.body)) {
        if (data === "[DONE]") break;
        let chunk: {
          choices?: {
            delta?: {
              content?: string | null;
              tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
            };
            finish_reason?: string | null;
          }[];
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (typeof choice.delta?.content === "string" && choice.delta.content) {
          yield { type: "text", delta: choice.delta.content };
        }
        for (const tc of choice.delta?.tool_calls ?? []) {
          const cur = toolCalls.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolCalls.set(tc.index, cur);
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      // Emit completed tool calls, then the terminal done event.
      for (const [, tc] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
        if (!tc.name) continue;
        let input: unknown = {};
        try {
          input = tc.args ? JSON.parse(tc.args) : {};
        } catch {
          input = {};
        }
        yield { type: "tool_use", id: tc.id || tc.name, name: tc.name, input };
      }
      yield mapFinishReason(finishReason);
    },
  };
}
