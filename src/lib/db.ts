import "server-only";

/**
 * Singleton connection to `data/pfm.sqlite3` (see `data/schema.md`). Server
 * only — imported exclusively by route handlers under `src/app/api/`, never
 * by client components (architectural invariant #4: the browser reaches this
 * data only through the API routes, never the storage layer directly).
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  const dbPath = path.join(process.cwd(), "data", "pfm.sqlite3");
  const schemaPath = path.join(process.cwd(), "data", "schema.sql");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  // Migration: the `jar_allocations` ledger was retired with the single-number
  // jar model (a jar's `budget_limit` is now its allocation — no separate earmark
  // table). Drop the legacy table if an older DB file still carries it, so the
  // schema below (which no longer defines it) leaves a clean database. Irreversible
  // by design — the rows were disposable mock display-partitions, no real value.
  db.exec("DROP TABLE IF EXISTS jar_allocations");
  addTransactionsSourceColumn(db);
  db.exec(readFileSync(schemaPath, "utf8"));
  mergeManualTransactions(db);
  // Migration: the `jars.role` donor-waterfall column was retired (donors are now
  // ordered by balance alone). Drop it from an older DB file; `DROP COLUMN` throws
  // once it is gone, which we swallow (idempotent).
  try {
    db.exec("ALTER TABLE jars DROP COLUMN role");
  } catch {
    // column already gone — nothing to do
  }
  instance = db;
  return db;
}

/**
 * Migration (one-table transactions): an older DB's `transactions` has no
 * `source` column. Add it BEFORE `schema.sql` runs — the schema's
 * `(cif, source, posted_at)` index would otherwise fail on the old table.
 * Existing rows are bank history → default `mock`. No-op on a fresh DB (the
 * table doesn't exist yet) or once the column is present.
 */
export function addTransactionsSourceColumn(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (cols.length === 0 || cols.some((c) => c.name === "source")) return;
  db.exec(
    "ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'mock' CHECK (source IN ('mock', 'msb', 'self_reported'))",
  );
}

/**
 * Migration (one-table transactions): move rows of the retired
 * `manual_transactions` table into `transactions` as `self_reported`, then drop
 * it — atomically. A row whose id collides with a bank row is skipped (the bank
 * row is never overwritten, #5) and reported.
 */
export function mergeManualTransactions(db: Database.Database): void {
  const legacy = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'manual_transactions'").get();
  if (!legacy) return;
  db.transaction(() => {
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM manual_transactions").get() as { n: number };
    const { changes } = db
      .prepare(
        `INSERT OR IGNORE INTO transactions (cif, id, source, posted_at, payload)
         SELECT cif, id, 'self_reported', posted_at, payload FROM manual_transactions ORDER BY rowid`,
      )
      .run();
    if (changes < n) console.warn(`manual_transactions merge skipped ${n - changes} row(s) colliding with bank ids`);
    db.exec("DROP TABLE manual_transactions");
  })();
}
