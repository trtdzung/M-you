import "server-only";

/**
 * Migration (goal-backend T1): `accounts.type` gains `'goal'` — a goal account is a
 * real bank account row. SQLite cannot ALTER a CHECK constraint, so an older DB
 * whose `accounts` table was created without `'goal'` is rebuilt. Wired into
 * `getDb()` (`db.ts`) BEFORE `schema.sql` runs:
 *
 *   needsGoalAccountMigration → backupDbFile → rebuildAccountsForGoal → schema.sql
 *
 * Idempotent: once the stored table SQL contains `'goal'`, the check is false and
 * nothing (not even a backup) happens. A fresh DB (no `accounts` table yet) → no-op;
 * `schema.sql` creates the new table directly. `schema.sql` re-creates
 * `idx_accounts_cif`, which the DROP below removes with the old table.
 */

import type Database from "better-sqlite3";

/** Exactly the `accounts` definition in `data/schema.sql`, under a temp name. */
const ACCOUNTS_NEW_SQL = `CREATE TABLE accounts_new (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('current', 'savings', 'credit_card', 'goal')),
  institution TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance REAL NOT NULL,
  available_balance REAL NOT NULL,
  last_synced_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('msb', 'self_reported', 'estimated', 'mock')),
  tier TEXT,
  masked_number TEXT NOT NULL,
  account_number TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
)`;

const COLUMNS =
  "cif, id, type, institution, currency, balance, available_balance, last_synced_at, source, tier, masked_number, account_number, sort_order";

/** True when an `accounts` table exists and its CHECK does not yet allow `'goal'`. */
export function needsGoalAccountMigration(db: Database.Database): boolean {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get() as
    | { sql: string | null }
    | undefined;
  if (!row || !row.sql) return false;
  return !row.sql.includes("'goal'");
}

/**
 * Rebuild `accounts` with the new CHECK, atomically: create `accounts_new`, copy
 * every row, verify the row count is unchanged (a mismatch throws → rollback, the
 * old table stays), drop the old table, rename. The caller backs the file up first.
 */
export function rebuildAccountsForGoal(db: Database.Database): void {
  db.transaction(() => {
    const { n: before } = db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number };
    db.exec("DROP TABLE IF EXISTS accounts_new");
    db.exec(ACCOUNTS_NEW_SQL);
    db.exec(`INSERT INTO accounts_new (${COLUMNS}) SELECT ${COLUMNS} FROM accounts`);
    const { n: after } = db.prepare("SELECT COUNT(*) AS n FROM accounts_new").get() as { n: number };
    if (after !== before) {
      throw new Error(`goal-account migration aborted: copied ${after} of ${before} accounts row(s)`);
    }
    db.exec("DROP TABLE accounts");
    db.exec("ALTER TABLE accounts_new RENAME TO accounts");
  })();
}
