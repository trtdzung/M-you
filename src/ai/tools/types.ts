/**
 * Tool contract for the AI facade. A tool is a thin, read-only adapter around the
 * deterministic engine: JSON-schema input in, structured facts + provenance out.
 * Tools contain NO financial logic of their own (that lives in the engine) and
 * NEVER mutate anything. Invalid input yields a structured error, not a throw.
 */

import type { AiContext } from "@/ai/server/load-financials";

/** Structured output the validator traces and the UI renders as source chips. */
export interface ToolResult {
  /** Numeric/structured facts. Every number the narrative uses must appear here. */
  data: Record<string, unknown>;
  /** Human-readable provenance/period labels (never empty). */
  sources: string[];
  /** Optional period label, e.g. "09/2026". */
  period?: string;
}

export type ToolOutcome =
  | { ok: true; result: ToolResult }
  | { ok: false; error: string };

export interface AiTool {
  name: string;
  description: string;
  /** JSON schema for the tool input (LLM-neutral). */
  inputSchema: Record<string, unknown>;
  /** Pure handler: reads AiContext, returns facts. No I/O, no mutation. */
  handler(input: unknown, ctx: AiContext): ToolOutcome;
}

export function ok(result: ToolResult): ToolOutcome {
  return { ok: true, result };
}

export function fail(error: string): ToolOutcome {
  return { ok: false, error };
}

/** Read a string field from unknown tool input, if present. */
export function strField(input: unknown, key: string): string | undefined {
  if (input && typeof input === "object" && key in input) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Read a finite number field from unknown tool input, if present. */
export function numField(input: unknown, key: string): number | undefined {
  if (input && typeof input === "object" && key in input) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}
