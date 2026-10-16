/**
 * Pure shape guards for an allocation arriving off the wire, kept SEPARATE from
 * the server-only store (`jar-allocations-store.ts`) so they are unit-testable
 * in the jsdom test env (importing `server-only` throws there) — mirroring how
 * `jar-input.ts` keeps jar guards pure. No React, no I/O, no `server-only`.
 *
 * A batch write ("Chia ngay") is all-or-nothing: a single malformed element
 * rejects the whole list, so a partial allocation can never be persisted.
 */

/** One sanitised allocation input — the three fields a client may send. */
export interface AllocationInput {
  txnId: string;
  jarId: string;
  amount: number;
}

/** A finite, strictly-positive amount, or `undefined` for anything else. */
function positiveAmount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Guard one allocation input: `txnId`/`jarId` non-empty strings, `amount`
 * finite and > 0. Unknown fields are dropped. Returns `null` on any violation.
 */
export function sanitizeAllocationInput(input: unknown): AllocationInput | null {
  if (typeof input !== "object" || input === null) return null;
  const a = input as Record<string, unknown>;
  if (typeof a.txnId !== "string" || a.txnId === "") return null;
  if (typeof a.jarId !== "string" || a.jarId === "") return null;
  const amount = positiveAmount(a.amount);
  if (amount === undefined) return null;
  return { txnId: a.txnId, jarId: a.jarId, amount };
}

/**
 * Guard a list; a single bad element (or a non-array / empty list) rejects the
 * whole batch (`null`) rather than silently dropping rows.
 */
export function sanitizeAllocationInputs(input: unknown): AllocationInput[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: AllocationInput[] = [];
  for (const item of input) {
    const row = sanitizeAllocationInput(item);
    if (!row) return null;
    out.push(row);
  }
  return out;
}
