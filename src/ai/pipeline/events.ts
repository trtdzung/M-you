/**
 * Wire events streamed from the assistant pipeline to the client (NDJSON). These
 * are higher-level than raw LLM stream events: they carry source chips, what-if
 * chart payloads, and degraded/refusal signals the UI renders directly.
 */

export interface WhatIfChartPayload {
  kind: "goal" | "debt";
  title: string;
  /** Projection points (month key → value). */
  series: { month: string; value: number }[];
  /** Target/payoff month to mark, if known. */
  markerMonth?: string | null;
  /** One-line numeric summary (already grounded in the tool result). */
  summary: string;
}

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; sources: string[]; period?: string }
  | { type: "chart"; chart: WhatIfChartPayload }
  | { type: "degraded"; reason: string }
  | { type: "refusal"; reason: string }
  | { type: "done"; degraded?: boolean }
  | { type: "error"; message: string };
