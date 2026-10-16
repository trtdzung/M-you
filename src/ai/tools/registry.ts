/**
 * Tool registry. Tier A = whitelisted read-only analytics + deterministic
 * simulations. This is the ONLY set the LLM can call in the read/analysis
 * pipeline.
 *
 * Tier B (draft tools that PREPARE — never execute — a transfer) lives in
 * `draft-tools.ts` and is DELIBERATELY absent from `toolSchemas()`: the LLM can
 * never call it. The action pipeline invokes Tier B directly, server-side, with
 * fields parsed in code — so a prompt-injected model cannot fill transfer fields
 * or trigger a draft. `TIER_B_TOOL_NAMES` is re-exported only so tests can assert
 * these names never leak into the LLM schema.
 */

import type { LlmTool } from "@/ai/llm/types";
import type { AiTool } from "./types";
import { READ_TOOLS } from "./read-tools";
import { SIM_TOOLS } from "./sim-tools";

export { TIER_B_TOOL_NAMES } from "./draft-tools";

export const TIER_A_TOOLS: AiTool[] = [...READ_TOOLS, ...SIM_TOOLS];

const BY_NAME: Map<string, AiTool> = new Map(TIER_A_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): AiTool | undefined {
  return BY_NAME.get(name);
}

/** Map registered tools to the provider-neutral LLM tool schema. */
export function toolSchemas(tools: AiTool[] = TIER_A_TOOLS): LlmTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export type { AiTool, ToolResult, ToolOutcome } from "./types";
