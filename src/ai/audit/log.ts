/**
 * In-memory audit sink for the prototype. Keeps a bounded ring buffer and emits
 * a compact structured log line per event. No PII, no prompt text — only the
 * metadata in `AiAuditEvent`. A pilot swaps `recordAuditEvent` for a DB write.
 */

import type { AiAuditEvent } from "./types";

const MAX_EVENTS = 200;
const buffer: AiAuditEvent[] = [];

/** Generate a request id (crypto if available, else a timestamp fallback). */
export function newRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function recordAuditEvent(event: AiAuditEvent): void {
  buffer.push(event);
  if (buffer.length > MAX_EVENTS) buffer.shift();
  // Structured, PII-free log line.
  console.info("[ai.audit]", JSON.stringify(event));
}

/** Test/introspection helpers. */
export function getAuditLog(): readonly AiAuditEvent[] {
  return buffer;
}

export function clearAuditLog(): void {
  buffer.length = 0;
}
