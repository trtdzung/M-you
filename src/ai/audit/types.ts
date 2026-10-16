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

/**
 * Draft metadata for an assisted-transfer request (Level 3). METADATA ONLY:
 * risk flags and whether the amount threshold was hit — never the recipient
 * account number, amount detail, OTP, or credentials.
 */
export interface AiDraftAudit {
  riskFlags: string[];
  thresholdHit: boolean;
  /** Outcome of the action turn (draft handed off, or stopped to ask/confirm). */
  outcome: "draft" | "reconfirm" | "clarify" | "refused";
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
  /** Present only for assisted-transfer (draft) requests. Metadata only. */
  draft?: AiDraftAudit;
}
