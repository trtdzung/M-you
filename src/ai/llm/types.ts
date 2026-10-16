/**
 * Provider-neutral LLM contract. The AI facade depends only on these types, so
 * swapping providers (Anthropic default, or any other) is a single adapter file.
 * Numbers never originate here — the LLM narrates; the engine is the ledger.
 */

/** One block of message content — maps cleanly to Anthropic and OpenAI shapes. */
export type LlmContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: "user" | "assistant";
  content: LlmContentBlock[];
}

/** A whitelisted tool the model may call (JSON-schema input). */
export interface LlmTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmStreamParams {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  temperature?: number;
}

/** Low-level events emitted by an adapter while streaming one model turn. */
export type LlmStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "done"; stopReason: "end" | "tool_use" | "max_tokens" | "other" }
  | { type: "error"; message: string };

/** The only thing the facade needs from any provider. */
export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  streamMessage(params: LlmStreamParams): AsyncIterable<LlmStreamEvent>;
}
