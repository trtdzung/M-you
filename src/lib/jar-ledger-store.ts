import "server-only";

/**
 * Read/write access to the `jar_ledger` table (see `data/schema.sql`): per-jar
 * deposit/withdraw rows feeding a jar's running BALANCE. A display partition of
 * CASA — never money movement (invariant #3) — and always `self_reported` (#5).
 * Server only (invariant #4). Every query is scoped by `cif` and parameterized.
 *
 * `appendJarLedger` is atomic by itself; callers composing it with other writes
 * wrap everything in their own `db.transaction` (better-sqlite3 nests as a
 * savepoint, so the inner transaction joins the outer one).
 */

import type { JarLedgerEntry } from "@/domain/models";
import { isJarAmount, MAX_JAR_AMOUNT } from "@/domain/jar-rules";
import { getDb } from "./db";

interface LedgerRow {
  id: string;
  jar_id: string;
  kind: "deposit" | "withdraw";
  amount: number;
  is_opening: number;
  created_at: string;
}

/** A row to append. `source` is not settable — the table only holds `self_reported`. */
export type NewJarLedgerEntry = Omit<JarLedgerEntry, "source">;

function toEntry(row: LedgerRow): JarLedgerEntry {
  return {
    id: row.id,
    jarId: row.jar_id,
    kind: row.kind,
    amount: row.amount,
    isOpening: row.is_opening === 1,
    createdAt: row.created_at,
    source: "self_reported",
  };
}

/** The persona's ledger, oldest first (insertion order breaks timestamp ties). */
export function readJarLedger(cif: string): JarLedgerEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, jar_id, kind, amount, is_opening, created_at FROM jar_ledger
       WHERE cif = ? ORDER BY created_at ASC, rowid ASC`,
    )
    .all(cif) as LedgerRow[];
  return rows.map(toEntry);
}

/**
 * Why an entry is invalid, or `null` when it is fine. Amounts are whole-VND safe
 * integers > 0; only an opening deposit may be 0, and an opening row is always a
 * deposit (mirrors the table's CHECKs so a bad entry fails with a clear message).
 */
function entryViolation(e: NewJarLedgerEntry): string | null {
  if (typeof e.id !== "string" || e.id === "") return "id";
  if (typeof e.jarId !== "string" || e.jarId === "") return "jarId";
  if (e.kind !== "deposit" && e.kind !== "withdraw") return "kind";
  if (typeof e.isOpening !== "boolean") return "isOpening";
  if (e.isOpening && e.kind !== "deposit") return "opening must be a deposit";
  if (!Number.isSafeInteger(e.amount) || e.amount < 0) return "amount";
  if (e.amount === 0 && !e.isOpening) return "amount must be > 0";
  if (typeof e.createdAt !== "string" || !Number.isFinite(Date.parse(e.createdAt))) return "createdAt";
  return null;
}

/**
 * Append entries for `cif`, all-or-nothing. Every entry is validated BEFORE any
 * insert; an invalid one throws a `RangeError`. A duplicate id or a second opening
 * row for the same jar violates the table's constraints and throws, rolling back
 * the whole batch.
 */
export function appendJarLedger(cif: string, entries: NewJarLedgerEntry[]): void {
  for (const entry of entries) {
    const violation = entryViolation(entry);
    if (violation) throw new RangeError(`Invalid jar ledger entry (${violation})`);
  }
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO jar_ledger (cif, id, jar_id, kind, amount, is_opening, created_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'self_reported')`,
  );
  db.transaction(() => {
    for (const e of entries) insert.run(cif, e.id, e.jarId, e.kind, e.amount, e.isOpening ? 1 : 0, e.createdAt);
  })();
}

/**
 * Delete every ledger row of `cif` whose jar is NOT in `keepJarIds` — a jar that
 * left the config takes its balance with it, so a reused id never inherits a
 * stale balance. Returns the number of rows deleted.
 */
export function deleteLedgerExcept(cif: string, keepJarIds: string[]): number {
  return getDb()
    .prepare("DELETE FROM jar_ledger WHERE cif = ? AND jar_id NOT IN (SELECT value FROM json_each(?))")
    .run(cif, JSON.stringify(keepJarIds)).changes;
}

/**
 * Server-minted ledger row id `led-<ms>-<tag>-<rand>`: time-ordered for humans,
 * with a random tail so two batches in the same millisecond never collide on the
 * `(cif, id)` primary key.
 */
export function ledgerEntryId(now: Date, tag: string | number): string {
  return `led-${now.getTime()}-${tag}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Most entries one `POST /api/jar-ledger` batch may carry. */
export const MAX_LEDGER_BATCH = 50;

/** One entry of a ledger batch as it arrives off the wire (ids/timestamps are server-minted). */
export interface LedgerBatchEntry {
  jarId: string;
  kind: "deposit" | "withdraw";
  amount: number;
}

/**
 * Shape guard for a `POST /api/jar-ledger` body's `entries`: 1–`MAX_LEDGER_BATCH`
 * entries, each `{jarId, kind: "deposit"|"withdraw", amount}` with a whole-VND
 * amount in `(0, MAX_JAR_AMOUNT]`, and Σ amount ≤ `MAX_JAR_AMOUNT` (Red Team #12).
 * Unknown fields are dropped; any bad entry rejects the whole batch (`null`).
 */
export function sanitizeLedgerBatch(input: unknown): LedgerBatchEntry[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_LEDGER_BATCH) return null;
  const entries: LedgerBatchEntry[] = [];
  let total = 0;
  for (const item of input) {
    if (typeof item !== "object" || item === null) return null;
    const e = item as Record<string, unknown>;
    if (typeof e.jarId !== "string" || e.jarId === "") return null;
    if (e.kind !== "deposit" && e.kind !== "withdraw") return null;
    if (!isJarAmount(e.amount) || e.amount === 0) return null;
    total += e.amount;
    if (total > MAX_JAR_AMOUNT) return null;
    entries.push({ jarId: e.jarId, kind: e.kind, amount: e.amount });
  }
  return entries;
}
