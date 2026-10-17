/**
 * In-memory SQLite DDL shared by the `/api/jars` route suites — the minimal
 * `jars` / `accounts` / `transactions` tables the handlers touch (jar
 * writes, the CASA cap's `casaPoolForCif`, and DELETE's rebalance-leg cleanup).
 */

export const JARS_DDL = `CREATE TABLE jars (
  id TEXT NOT NULL, cif TEXT NOT NULL, label TEXT NOT NULL, category_ids TEXT NOT NULL,
  budget_limit REAL, color TEXT, icon TEXT, sort_order INTEGER NOT NULL, role TEXT,
  PRIMARY KEY (cif, id)
);`;

// CASA is DB-backed: `casaPoolForCif` reads the `accounts` table (lazily
// seeding CIF_0001's 18tr `current` account on first read).
export const ACCOUNTS_DDL = `CREATE TABLE accounts (
  cif TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, institution TEXT NOT NULL,
  currency TEXT NOT NULL, balance REAL NOT NULL, available_balance REAL NOT NULL,
  last_synced_at TEXT NOT NULL, source TEXT NOT NULL, tier TEXT,
  masked_number TEXT NOT NULL, account_number TEXT NOT NULL, sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
);`;

// The one-table `transactions` (bank + self_reported rows, told apart by `source`).
export const TRANSACTIONS_DDL = `CREATE TABLE transactions (
  cif TEXT NOT NULL, id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'mock' CHECK (source IN ('mock', 'msb', 'self_reported')),
  posted_at TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY (cif, id)
);`;
