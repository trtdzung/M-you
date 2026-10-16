/**
 * Wire events streamed from the assistant pipeline to the client (NDJSON). These
 * are higher-level than raw LLM stream events: they carry source chips, what-if
 * chart payloads, and degraded/refusal signals the UI renders directly.
 */

import type { RecipientSource, TransferRiskFlag } from "@/domain/models";

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

/**
 * Client-facing projection of a `TransferDraft` — MASK-ONLY. The full recipient
 * account number never leaves the server; the UI and the confirm screen work
 * from the masked reference. No OTP/credential/execution field exists here.
 */
export interface TransferDraftView {
  id: string;
  recipientName: string;
  recipientAccountMasked: string;
  recipientSource: RecipientSource;
  sourceAccountLabel: string;
  amount: number;
  currency: string;
  memo: string | null;
  riskFlags: TransferRiskFlag[];
  thresholdHit: boolean;
}

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; sources: string[]; period?: string }
  | { type: "chart"; chart: WhatIfChartPayload }
  | { type: "degraded"; reason: string }
  | { type: "refusal"; reason: string }
  // Level 3 assisted transfer drafting (draft-only; never executes):
  | { type: "clarify"; question: string }
  | { type: "reconfirm"; reason: string; summary: string; riskFlags: TransferRiskFlag[] }
  | { type: "draft"; draft: TransferDraftView; note?: string }
  | { type: "done"; degraded?: boolean }
  | { type: "error"; message: string };
