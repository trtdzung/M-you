import "server-only";

/**
 * Read/write access to the `manual_transactions` table (see `data/schema.md`).
 * Server only — imported by the route handlers under `src/app/api/manual-
 * transactions/`, never by client code (architectural invariant #4: the browser
 * reaches this data only through the API route, never the storage layer).
 *
 * These are SELF-REPORTED records (the ＋ FAB and the transfer success card), not
 * money movement (#3). The store never fabricates one: it persists exactly the
 * `Transaction` the client built (client owns id + shape), forcing only
 * `source: "self_reported"` so a row can never masquerade as bank-verified (#5).
 */

import type { Transaction } from "@/domain/models";
import { getDb } from "./db";

interface ManualTxnRow {
  payload: string;
}

/** Parse a stored payload back to a Transaction; forces the self-reported source. */
function toTransaction(row: ManualTxnRow): Transaction | null {
  try {
    const txn = JSON.parse(row.payload) as Transaction;
    if (!txn || typeof txn.id !== "string") return null;
    return { ...txn, source: "self_reported" };
  } catch {
    return null;
  }
}

/** The persona's self-reported txns, newest first (matches the localStorage order). */
export function readManualTxns(cif: string): Transaction[] {
  const rows = getDb()
    .prepare("SELECT payload FROM manual_transactions WHERE cif = ? ORDER BY posted_at DESC, rowid DESC")
    .all(cif) as ManualTxnRow[];
  return rows.map(toTransaction).filter((t): t is Transaction => t !== null);
}

/**
 * Insert (or replace) one self-reported txn. `source` is forced server-side so
 * the client can never store a record as anything but self-reported (#5). Idempotent
 * on (cif, id) — a replayed create is a harmless overwrite, never a duplicate.
 */
export function upsertManualTxn(cif: string, txn: Transaction): void {
  const record: Transaction = { ...txn, source: "self_reported" };
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO manual_transactions (cif, id, posted_at, payload)
       VALUES (@cif, @id, @postedAt, @payload)`,
    )
    .run({ cif, id: record.id, postedAt: record.postedAt, payload: JSON.stringify(record) });
}

/**
 * Patch category/type/purpose/note on an existing row (read-modify-write inside a
 * transaction so a concurrent write can't clobber the merge). Returns the updated
 * txn, or `null` when no row has that id (the route maps that to a 404) — mirrors
 * the client `update`'s found-boolean contract.
 */
/** Whitelisted mutable fields. `null` over the wire ⇒ CLEAR the field. */
export type ManualTxnPatch = {
  categoryId?: string;
  type?: Transaction["type"];
  transferPurpose?: string | null;
  note?: string | null;
  /** Inter-jar rebalance meta (Phase 03). `null` over the wire ⇒ CLEAR the field. */
  rebalance?: Transaction["rebalance"] | null;
  /** Refund/reversal of a trigger txn (RT-fix H3) — non-clearable. */
  status?: Transaction["status"];
  /** Amount edit of a trigger txn (RT-fix H5) — non-clearable. */
  amount?: number;
};

export function patchManualTxn(cif: string, id: string, patch: ManualTxnPatch): Transaction | null {
  const db = getDb();
  const run = db.transaction((): Transaction | null => {
    const row = db
      .prepare("SELECT payload FROM manual_transactions WHERE cif = ? AND id = ?")
      .get(cif, id) as ManualTxnRow | undefined;
    if (!row) return null;
    const current = toTransaction(row);
    if (!current) return null;
    // Controlled merge over the whitelist only: `null` CLEARS an optional field
    // (parity with the client, where a plain category pick clears a stale
    // transferPurpose); `undefined`/absent leaves it unchanged.
    const next: Transaction = { ...current, userEdited: true };
    if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;
    if (patch.type !== undefined) next.type = patch.type;
    if (patch.transferPurpose === null) delete next.transferPurpose;
    else if (patch.transferPurpose !== undefined) next.transferPurpose = patch.transferPurpose;
    if (patch.note === null) delete next.note;
    else if (patch.note !== undefined) next.note = patch.note;
    if (patch.rebalance === null) delete next.rebalance;
    else if (patch.rebalance !== undefined) next.rebalance = patch.rebalance;
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.amount !== undefined) next.amount = Math.abs(patch.amount);
    upsertManualTxn(cif, next);
    return next;
  });
  return run();
}

/** WHERE clause matching a rebalance leg whose donor OR target is `@jarId`. */
const LEG_OF_JAR = `cif = @cif AND (
  json_extract(payload, '$.rebalance.fromJarId') = @jarId OR
  json_extract(payload, '$.rebalance.toJarId') = @jarId)`;

/** How many rebalance legs of `cif` reference `jarId` (from or to) — the UI's pre-delete warning. */
export function countRebalanceLegsForJar(cif: string, jarId: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM manual_transactions WHERE ${LEG_OF_JAR}`)
    .get({ cif, jarId }) as { n: number };
  return row.n;
}

/**
 * Delete every rebalance leg of `cif` referencing `jarId` (S8): a leg pointing at
 * a jar that no longer exists would move money "from nowhere". Returns the number
 * removed. Callers wrap it in the same transaction as the jar delete.
 */
export function deleteRebalanceLegsForJar(cif: string, jarId: string): number {
  return getDb().prepare(`DELETE FROM manual_transactions WHERE ${LEG_OF_JAR}`).run({ cif, jarId }).changes;
}

/** Delete one self-reported txn (no-op if absent). */
export function deleteManualTxn(cif: string, id: string): void {
  getDb().prepare("DELETE FROM manual_transactions WHERE cif = ? AND id = ?").run(cif, id);
}
