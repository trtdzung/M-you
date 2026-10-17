/**
 * In-memory SQLite DDL shared by the `/api/jars` route suites — the minimal
 * `jars` / `jar_ledger` / `categories` / `accounts` / `transactions` tables the handlers touch
 * (jar writes, the CASA cap's `casaPoolForCif`, and DELETE's rebalance-leg
 * cleanup).
 */

/**
 * The per-cif taxonomy. It travels WITH `JARS_DDL` because a jar read/write can
 * no longer happen without it: `readJarConfig` heals against
 * `assignableCategoryIds(cif)` and `categoryViolation` validates against
 * `knownExpenseCategoryIds(cif)`, both of which lazily seed this table.
 */
export const CATEGORIES_DDL = `CREATE TABLE categories (
  cif TEXT NOT NULL, id TEXT NOT NULL, label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'transfer')),
  fixed INTEGER NOT NULL, custom INTEGER NOT NULL DEFAULT 0, archived_at TEXT,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
);`;

/**
 * The per-jar deposit/withdraw ledger. Travels WITH `JARS_DDL`: `readJarConfig`
 * attaches it and `writeJarConfig` prunes rows of removed jars.
 */
export const JAR_LEDGER_DDL = `CREATE TABLE jar_ledger (
  cif TEXT NOT NULL, id TEXT NOT NULL, jar_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdraw')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  is_opening INTEGER NOT NULL DEFAULT 0 CHECK (is_opening IN (0, 1)),
  created_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'self_reported' CHECK (source = 'self_reported'),
  CHECK (amount > 0 OR is_opening = 1),
  CHECK (is_opening = 0 OR kind = 'deposit'),
  PRIMARY KEY (cif, id)
);
CREATE UNIQUE INDEX uq_jar_ledger_opening ON jar_ledger (cif, jar_id) WHERE is_opening = 1;`;

export const JARS_DDL = `CREATE TABLE jars (
  id TEXT NOT NULL, cif TEXT NOT NULL, label TEXT NOT NULL, category_ids TEXT NOT NULL,
  budget_limit REAL, color TEXT, icon TEXT, sort_order INTEGER NOT NULL, created_at TEXT,
  PRIMARY KEY (cif, id)
);
${CATEGORIES_DDL}
${JAR_LEDGER_DDL}`;

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

// User category corrections / hidden flags — `liveTxns` folds them in so the
// write guards judge the same balance the screen renders.
export const CORRECTIONS_DDL = `CREATE TABLE transaction_corrections (
  cif TEXT NOT NULL, txn_id TEXT NOT NULL,
  payload TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (cif, txn_id)
);`;
