/**
 * Tool registry. Tier A = whitelisted read-only analytics + deterministic
 * simulations. This is the ONLY set the LLM can call in the read/analysis
 * pipeline. Tier B (draft tools that prepare — never execute — a transfer) is
 * deliberately absent until the gated Level 3 phase.
 */

import type { LlmTool } from "@/ai/llm/types";
import type { AiTool } from "./types";
import { READ_TOOLS } from "./read-tools";
import { SIM_TOOLS } from "./sim-tools";

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
