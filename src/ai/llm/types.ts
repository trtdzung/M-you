/**
 * Provider-neutral LLM contract. The categorize route (and any future AI facade
 * caller) depends ONLY on this shape, so adding a provider is one adapter, not a
 * pipeline change. Types are erased at build time, so this file is safe to import
 * anywhere; the concrete adapters and `getLlmClient()` are `server-only`.
 *
 * The client returns TEXT only. It never returns a number the engine consumes
 * (invariant #1) — callers parse a category *suggestion* out of the text and the
 * categorize service validates it before it becomes an overlay assignment.
 */

export interface LlmChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmCompletionOptions {
  /** Request a strict JSON-object response when the provider supports it. */
  json?: boolean;
  /** Default 0 — categorization must be deterministic, not creative. */
  temperature?: number;
  maxTokens?: number;
}

export interface LlmClient {
  /** Resolved model id (telemetry/logging only). */
  readonly model: string;
  /** Return the assistant message text for the given messages. */
  complete(messages: LlmChatMessage[], options?: LlmCompletionOptions): Promise<string>;
}
