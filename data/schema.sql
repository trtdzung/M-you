-- Schema for data/pfm.sqlite3. See data/schema.md for a human-readable
-- description of each table. Idempotent (CREATE TABLE IF NOT EXISTS) so
-- running it against an existing DB file is always safe.

CREATE TABLE IF NOT EXISTS beneficiaries (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('msb', 'self_reported', 'estimated', 'mock')),
  created_at TEXT NOT NULL,
  UNIQUE (cif, bank_name, account_number)
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_cif ON beneficiaries (cif);
-- Spending jars ("hũ"), per persona (`cif`). A jar is a GROUP of expense
-- categories with an optional monthly limit (`budget_limit`); NULL means "chưa
-- đặt" — never a silent 0 (invariant #6). A jar has NO stored balance: its
-- spendable = max(0, remaining) is DERIVED from txn history (invariant #1).
-- Every expense category belongs to exactly one jar, enforced server-side by the
-- /api/jars route handlers.
CREATE TABLE IF NOT EXISTS jars (
  id TEXT NOT NULL,
  cif TEXT NOT NULL,
  label TEXT NOT NULL,
  category_ids TEXT NOT NULL,      -- JSON array of category id strings
  budget_limit REAL,               -- NULL = "chưa đặt" (Đã set), never 0
  role TEXT,                       -- donor-waterfall role (buffer/spending/essential/goal); NULL → treated as spending
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL,     -- display order (a jar added later sorts last)
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_jars_cif ON jars (cif);

-- Bank accounts per persona (`cif`) — the CASA source of truth. Previously pure
-- in-memory fixtures + a localStorage debit overlay; now a real table so a
-- transfer debits the balance server-side and it persists (mock core-banking).
-- `balance`/`available_balance` are mutated directly by a confirmed transfer
-- (see /api/accounts/debit). `sort_order` fixes display order (current first).
CREATE TABLE IF NOT EXISTS accounts (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('current', 'savings', 'credit_card')),
  institution TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance REAL NOT NULL,
  available_balance REAL NOT NULL,
  last_synced_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('msb', 'self_reported', 'estimated', 'mock')),
  tier TEXT,                       -- NULL for accounts with no membership tier
  masked_number TEXT NOT NULL,
  account_number TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_cif ON accounts (cif);

-- Self-reported transactions per persona (`cif`) — the records a user enters via
-- the ＋ FAB or that a confirmed transfer writes on the success card. NOT money
-- movement (invariant #3): every row is `source: 'self_reported'`, never
-- bank-verified (#5). Previously localStorage-only; now a real table so they
-- persist across reloads/dev-server restarts/devices. The rich, evolving
-- `Transaction` shape is stored as a JSON `payload` (same JSON-in-column pattern
-- as `jars.category_ids`); `posted_at` is a column purely for newest-first order.
CREATE TABLE IF NOT EXISTS manual_transactions (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  posted_at TEXT NOT NULL,          -- ISO 8601; ordering only (newest first)
  payload TEXT NOT NULL,            -- full JSON Transaction (source: self_reported)
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_manual_txns_cif ON manual_transactions (cif);

-- NOTE: the legacy `jar_allocations` table was retired with the single-number
-- ("một con số") jar model — a jar's `budget_limit` IS its allocation now, so
-- there is no separate earmark ledger. `db.ts` drops the old table on connect.
