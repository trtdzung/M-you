import "server-only";

/**
 * Adapter for an OpenAI-compatible Chat Completions endpoint — used for VNG
 * GreenNode's MaaS (`.../v1/chat/completions`, Bearer API key). `server-only`:
 * importing it from a client component is a build error, so the API key never
 * enters the browser bundle.
 */

import type { LlmChatMessage, LlmClient, LlmCompletionOptions } from "./types";

export interface OpenAiCompatibleConfig {
  /** e.g. https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
}

/** Upstream call timeout — a hanging model must not tie up the request handler. */
const REQUEST_TIMEOUT_MS = 15_000;

export function createOpenAiCompatibleClient(cfg: OpenAiCompatibleConfig): LlmClient {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    model: cfg.model,
    async complete(messages: LlmChatMessage[], options?: LlmCompletionOptions): Promise<string> {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: options?.temperature ?? 0,
          max_tokens: options?.maxTokens ?? 1024,
          // OpenAI-compatible servers accept response_format; harmless if ignored.
          ...(options?.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`LLM ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new Error("LLM returned an empty completion");
      }
      return content;
    },
  };
}
