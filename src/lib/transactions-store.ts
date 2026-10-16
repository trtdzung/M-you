import "server-only";

/**
 * Read access to the `transactions` table (see `data/schema.md`) — the
 * bank-provided transaction history. Server only — imported by the route
 * handler under `src/app/api/transactions/`, never by client code
 * (architectural invariant #4).
 *
 * Rows are seeded per persona from the same deterministic generator the
 * accounts come from (`generateDataset`), lazily on first read of a persona
 * that has none — so a fresh/unseeded DB still works (mirrors `accounts-store`).
 * Self-reported records live in `manual_transactions`, never here (#5).
 */

import type { Transaction } from "@/domain/models";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { generateDataset } from "@/providers/mock/fixtures/generate";
import { getDb } from "./db";

interface TxnRow {
  payload: string;
}

/** Parse a stored payload; a corrupt row is dropped, never fabricated. */
function toTransaction(row: TxnRow): Transaction | null {
  try {
    const txn = JSON.parse(row.payload) as Transaction;
    return txn && typeof txn.id === "string" ? txn : null;
  } catch {
    return null;
  }
}

/**
 * Seed a persona's history if the table has none for that `cif`. Idempotent
 * (`INSERT OR IGNORE` + a pre-count) so two concurrent first-reads can't
 * double-insert. An unknown `cif` (no persona) is a no-op → caller gets `[]`.
 */
function seedIfEmpty(cif: string): void {
  const db = getDb();
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ?").get(cif) as { n: number };
  if (n > 0) return;
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return;
  const insert = db.prepare(
    "INSERT OR IGNORE INTO transactions (cif, id, posted_at, payload) VALUES (@cif, @id, @postedAt, @payload)",
  );
  const seed = db.transaction((txns: Transaction[]) => {
    for (const txn of txns) insert.run({ cif, id: txn.id, postedAt: txn.postedAt, payload: JSON.stringify(txn) });
  });
  seed(generateDataset(persona).transactions);
}

/**
 * The persona's transactions, newest first, optionally bounded by `postedAt`
 * (inclusive, same string comparison the provider query has always used).
 */
export function readTransactions(cif: string, range: { from?: string; to?: string } = {}): Transaction[] {
  seedIfEmpty(cif);
  const rows = getDb()
    .prepare(
      `SELECT payload FROM transactions
        WHERE cif = @cif
          AND (@from IS NULL OR posted_at >= @from)
          AND (@to IS NULL OR posted_at <= @to)
        ORDER BY posted_at DESC, id DESC`,
    )
    .all({ cif, from: range.from ?? null, to: range.to ?? null }) as TxnRow[];
  return rows.map(toTransaction).filter((t): t is Transaction => t !== null);
}
