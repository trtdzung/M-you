/**
 * AI audit event (PFM-091). Recorded once per assistant request. Captures WHAT
 * happened (intent, tools, validation, degraded) and the consent context — never
 * the raw prompt, PII, account numbers, or credentials. Prototype-level: this is
 * the shape a pilot persists; here it lives in memory + structured logs.
 */

import type { ConsentScope } from "@/lib/consent";

export interface AiValidationResult {
  numericOk: boolean;
  safetyOk: boolean;
}

export interface AiAuditEvent {
  requestId: string;
  consentVersion: string;
  /** Scopes the request ran under (access boundary), not the data itself. */
  dataScope: ConsentScope[];
  intent: string;
  toolsUsed: string[];
  validation: AiValidationResult;
  degraded: boolean;
  createdAt: string;
}
