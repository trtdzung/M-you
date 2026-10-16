import "server-only";

/**
 * `getLlmClient()` — selects an LLM provider from env (see `.env.example`) and
 * returns a ready client, or `null` when no key is configured so the app ALWAYS
 * builds and runs offline (callers degrade to the local heuristic, never crash).
 *
 * Provider resolution:
 *  - `LLM_PROVIDER` explicit wins ("openai" | "vng" | "none"/"off" | "anthropic").
 *  - Unset: infer "openai" when `OPENAI_API_KEY` is present, else "vng" when
 *    `AI_PLATFORM_API_KEY` is present, else "anthropic".
 *
 * The VNG GreenNode and OpenAI adapters (both OpenAI-compatible) are implemented
 * in this prototype slice; "anthropic" is documented but has no adapter yet, so
 * it resolves to `null` (offline) until one is added — one file, no pipeline
 * change.
 */

import type { LlmClient } from "./types";
import { createOpenAiCompatibleClient } from "./openai-compatible-client";

const DEFAULT_VNG_BASE_URL = "https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1";
const DEFAULT_VNG_MODEL = "qwen/qwen3.6-flash";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function resolveProvider(): string {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.OPENAI_API_KEY) return "openai";
  return process.env.AI_PLATFORM_API_KEY ? "vng" : "anthropic";
}

export function getLlmClient(): LlmClient | null {
  const provider = resolveProvider();
  if (provider === "none" || provider === "off") return null;

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null; // offline fallback — no key, no client
    return createOpenAiCompatibleClient({
      // Dedicated OPENAI_BASE_URL so a VNG LLM_BASE_URL can't leak into OpenAI calls.
      baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
      apiKey,
      model: process.env.LLM_MODEL || DEFAULT_OPENAI_MODEL,
    });
  }

  if (provider === "vng") {
    const apiKey = process.env.AI_PLATFORM_API_KEY;
    if (!apiKey) return null; // offline fallback — no key, no client
    return createOpenAiCompatibleClient({
      baseUrl: process.env.LLM_BASE_URL || DEFAULT_VNG_BASE_URL,
      apiKey,
      model: process.env.LLM_MODEL || DEFAULT_VNG_MODEL,
    });
  }

  // "anthropic" (or anything else): adapter not implemented in this slice.
  // Footgun guard: a GreenNode key is present but LLM_PROVIDER pins a provider
  // with no adapter, so the app silently stays offline. Warn once (server-side).
  if (process.env.OPENAI_API_KEY) {
    console.warn(
      `[llm] OPENAI_API_KEY is set but LLM_PROVIDER="${provider}" has no adapter — ` +
        `categorizer stays offline. Set LLM_PROVIDER=openai to use OpenAI.`,
    );
  } else if (process.env.AI_PLATFORM_API_KEY) {
    console.warn(
      `[llm] AI_PLATFORM_API_KEY is set but LLM_PROVIDER="${provider}" has no adapter — ` +
        `categorizer stays offline. Set LLM_PROVIDER=vng to use GreenNode.`,
    );
  }
  return null;
}
