/**
 * LLM provider selection. `getLlmClient()` chooses an adapter from env so the
 * provider stays flexible — Anthropic is the default, and adding another means
 * one new adapter + one case here. Returns `null` when no provider/key is
 * configured so the pipeline degrades to the offline fallback instead of
 * crashing (the build never hard-requires a key).
 *
 * `server-only` makes importing this from a client component a build error,
 * guaranteeing keys never reach the browser bundle.
 */

import "server-only";
import { createAnthropicClient } from "./anthropic-client";
import { createOpenAiCompatibleClient } from "./openai-compatible-client";
import type { LlmClient } from "./types";

export type { LlmClient, LlmMessage, LlmTool, LlmStreamEvent, LlmContentBlock } from "./types";

let cached: LlmClient | null | undefined;

function select(): LlmClient | null {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();

  switch (provider) {
    case "none":
    case "off":
      return null;
    case "anthropic":
      // No key → treat as "not configured" and fall back offline (not an error).
      if (!process.env.ANTHROPIC_API_KEY) return null;
      return createAnthropicClient();
    case "vng":
    case "greennode":
    case "openai-compatible":
      // OpenAI-compatible endpoint (VNG GreenNode: Qwen/GLM/…). No key → offline.
      if (!process.env.AI_PLATFORM_API_KEY) return null;
      return createOpenAiCompatibleClient();
    default:
      throw new Error(
        `LLM_PROVIDER "${provider}" chưa được hỗ trợ. Thêm một adapter trong src/ai/llm/ rồi khai báo ở đây.`,
      );
  }
}

/** Configured LLM client, or `null` when none is available (offline mode). */
export function getLlmClient(): LlmClient | null {
  if (cached === undefined) cached = select();
  return cached;
}

/** Test-only: reset the memoized client so env changes take effect. */
export function resetLlmClientCache(): void {
  cached = undefined;
}
