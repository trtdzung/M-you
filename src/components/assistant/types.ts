import type { TransferDraftView, WhatIfChartPayload } from "@/ai/pipeline/events";
import type { TransferRiskFlag } from "@/domain/models";
import type { SourceChip } from "./SourceChips";

/** An in-chat threshold/fraud re-confirmation prompt (Level 3). */
export interface ReconfirmPrompt {
  reason: string;
  summary: string;
  riskFlags: TransferRiskFlag[];
}

/** One rendered chat bubble, accumulated from the event stream. */
export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  chips: SourceChip[];
  charts: WhatIfChartPayload[];
  degraded: boolean;
  refusal: boolean;
  error?: string;
  status: "streaming" | "done";
  /** Assisted-transfer draft to render (draft-only; never executes). */
  draft?: TransferDraftView;
  /** Threshold/fraud re-confirmation prompt shown before drafting. */
  reconfirm?: ReconfirmPrompt;
}
