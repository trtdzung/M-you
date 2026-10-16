import type { WhatIfChartPayload } from "@/ai/pipeline/events";
import type { SourceChip } from "./SourceChips";

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
}
