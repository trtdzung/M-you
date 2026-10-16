import "server-only";

/**
 * Read/write access to the `transaction_corrections` table (see
 * `data/schema.md`) — the per-transaction category overlay (user corrections,
 * AI/memory/heuristic assignments, `hidden` flag). Server only (invariant #4).
 *
 * The overlay never mutates the bank row in `transactions`; it reuses the pure
 * rules from `corrections-core.ts` so client and server agree:
 *  - every record is `normalize`d (legacy shapes, provenance defaults — #5);
 *  - a label must be a category in the stored taxonomy (else the whole write is
 *    rejected — nothing partial lands);
 *  - race guard: a non-user record never overwrites a user-authored one.
 */

import { isUserOrigin, normalize, type Correction, type Corrections } from "@/state/corrections-core";
import { categoryIdSet } from "./categories-store";
import { getDb } from "./db";

/** Upper bound on records per write — a whole persona's history fits easily. */
export const MAX_CHANGES = 5000;

interface CorrectionRow {
  txn_id: string;
  payload: string;
}

export function readCorrections(cif: string): Corrections {
  const rows = getDb()
    .prepare("SELECT txn_id, payload FROM transaction_corrections WHERE cif = ?")
    .all(cif) as CorrectionRow[];
  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      raw[row.txn_id] = JSON.parse(row.payload);
    } catch {
      // a corrupt row is skipped, never fabricated into a label
    }
  }
  return normalize(raw);
}

export type ApplyResult = { ok: true; corrections: Corrections } | { ok: false; invalidCategoryIds: string[] };

/**
 * Apply a batch of per-txn changes atomically: a record upserts, `null` deletes.
 * Unknown category ids reject the whole batch. Returns the persona's overlay as
 * it now reads back (the stored truth).
 */
export function applyCorrectionChanges(cif: string, changes: Record<string, unknown>): ApplyResult {
  const valid = categoryIdSet();
  const planned: Array<[string, Correction | null]> = [];
  const invalid = new Set<string>();

  for (const [txnId, value] of Object.entries(changes)) {
    if (!txnId) continue;
    const record = value === null ? null : (normalize({ [txnId]: value })[txnId] ?? null);
    if (record?.categoryId !== undefined && !valid.has(record.categoryId)) invalid.add(record.categoryId);
    planned.push([txnId, record]);
  }
  if (invalid.size > 0) return { ok: false, invalidCategoryIds: [...invalid] };

  const db = getDb();
  const select = db.prepare("SELECT payload FROM transaction_corrections WHERE cif = ? AND txn_id = ?");
  const upsert = db.prepare(
    `INSERT INTO transaction_corrections (cif, txn_id, payload, updated_at) VALUES (@cif, @txnId, @payload, @now)
     ON CONFLICT (cif, txn_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  );
  const remove = db.prepare("DELETE FROM transaction_corrections WHERE cif = ? AND txn_id = ?");
  const now = new Date().toISOString();

  db.transaction(() => {
    for (const [txnId, record] of planned) {
      if (record === null) {
        remove.run(cif, txnId);
        continue;
      }
      if (record.origin !== "user") {
        const existing = select.get(cif, txnId) as { payload: string } | undefined;
        const current = existing ? normalize({ [txnId]: JSON.parse(existing.payload) })[txnId] : undefined;
        if (isUserOrigin(current)) continue; // user wins — never clobbered by AI/memory/heuristic
      }
      upsert.run({ cif, txnId, payload: JSON.stringify(record), now });
    }
  })();

  return { ok: true, corrections: readCorrections(cif) };
}
