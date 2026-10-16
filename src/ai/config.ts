/**
 * Facade configuration for assisted transfer drafting (Level 3, EPIC-13).
 *
 * SAFETY NOTE: none of these toggles can grant the facade the ability to
 * execute, confirm, submit, or authenticate a transfer. They only gate whether
 * a transfer intent produces a reviewable DRAFT or the plain refusal. Every
 * safety guard (deterministic field parsing, no fabricated account numbers,
 * threshold re-confirm, fraud checkpoint) applies regardless of these values.
 */

/** Amount at/above which an in-chat re-confirmation is required before drafting. */
export const TRANSFER_THRESHOLD_VND = 10_000_000;

/** "Large" transfer floor for the fraud checkpoint (new payee + large + urgency). */
export const LARGE_TRANSFER_VND = TRANSFER_THRESHOLD_VND / 2;

/**
 * Whether a transfer intent creates a draft (default ON in the prototype, per
 * the 2026-09-04 product decision) or falls back to the plain refusal. Read at
 * call time so tests and deployments can flip it via `ENABLE_TRANSFER_DRAFTING`
 * (`0`/`false`/`off` disables). Never enables execution — only drafting.
 */
export function isTransferDraftingEnabled(): boolean {
  const v = process.env.ENABLE_TRANSFER_DRAFTING;
  if (v === undefined) return true;
  const norm = v.trim().toLowerCase();
  return !(norm === "0" || norm === "false" || norm === "off" || norm === "no");
}
