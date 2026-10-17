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

-- ALL transactions per persona (`cif`) in ONE table, told apart by `source`:
--  - `mock` / `msb` — bank-provided history (standing in for MSB core-banking),
--    seeded lazily per persona from the deterministic generator
--    (`fixtures/generate.ts`) on first read. Read-only for the app.
--  - `self_reported` — records a user enters via the ＋ FAB, the transfer record a
--    confirmed transfer writes, and the `dieu-chinh-hu` rebalance legs. NOT money
--    movement (invariant #3), never bank-verified (#5).
-- Provenance never mixes (#5): every app write/delete is scoped to
-- `source = 'self_reported'` and can never touch a bank row; bank reads/seeding
-- are scoped to `source <> 'self_reported'`. The rich `Transaction` shape is a
-- JSON `payload` (same JSON-in-column pattern as `jars.category_ids`);
-- `posted_at` is a column for period filtering + newest-first order.
-- (Replaces the former separate `manual_transactions` table — `db.ts` migrates it.)
CREATE TABLE IF NOT EXISTS transactions (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'mock'
    CHECK (source IN ('mock', 'msb', 'self_reported')),
  posted_at TEXT NOT NULL,          -- ISO 8601
  payload TEXT NOT NULL,            -- full JSON Transaction
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_cif_posted ON transactions (cif, posted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_cif_source ON transactions (cif, source, posted_at);

-- The spending/transfer category taxonomy ("categories are data", invariant #7),
-- PER PERSONA (`cif`) — like `jars`, `transactions` and `transaction_corrections`.
-- Per-cif is load-bearing, not cosmetic: jars are per-cif and every expense
-- category belongs to exactly one jar, so a GLOBAL taxonomy would mean one
-- persona's new category becomes an orphan for EVERY persona and each one's next
-- `readJarConfig` silently heals it into their "Khác" jar.
-- Seeded lazily per cif from `src/domain/models/categories.ts` (INSERT OR IGNORE,
-- so a category added in code appears and an edited row is never clobbered).
-- Sentinels (`unclassified`, `income`, `dieu-chinh-hu`) are NOT categories and
-- never stored.
--  - `custom` 0 = bundled preset (rename/delete-locked through the API, 403),
--    1 = user-created. A SEPARATE axis from `fixed` (which means "fixed/recurring
--    cost" and feeds the cashflow fixed-vs-discretionary split) — never overload it.
--  - `archived_at` NULL = active. An archived category leaves the assignable set
--    (pickers, orphan-heal) but KEEPS its jar membership and stays "known", so no
--    historical jar total ever moves and old corrections still round-trip.
-- NOT BACKWARD COMPATIBLE with a pre-Phase-02 `data/pfm.sqlite3`: the old table
-- has no `cif` column and `CREATE TABLE IF NOT EXISTS` will not add one, so a
-- stale file fails loudly on the index below. Run `npm run db:seed`.
CREATE TABLE IF NOT EXISTS categories (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,                 -- preset id, or `c_<slug>` for a custom one
  label TEXT NOT NULL,              -- Vietnamese display label
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'transfer')),
  fixed INTEGER NOT NULL,           -- 1 = fixed/recurring spend, 0 = discretionary
  custom INTEGER NOT NULL DEFAULT 0,-- 1 = user-created (rename/delete allowed)
  archived_at TEXT,                 -- ISO 8601; NULL = active
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_categories_cif ON categories (cif, sort_order);

-- Per-transaction category overlay per persona (`cif`): user corrections AND
-- AI/memory/heuristic assignments, plus the `hidden` flag. An overlay, never a
-- mutation of the bank row in `transactions` (invariant #4), so the original
-- category and the label's provenance (origin/confidence/status — #5) survive.
-- Previously browser localStorage only; now a real table so labels persist
-- across devices. `payload` is the normalized `Correction` JSON.
CREATE TABLE IF NOT EXISTS transaction_corrections (
  cif TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  payload TEXT NOT NULL,            -- JSON Correction {categoryId?, hidden?, origin, confidence?, status?}
  updated_at TEXT NOT NULL,
  PRIMARY KEY (cif, txn_id)
);

-- NOTE: the legacy `jar_allocations` table was retired with the single-number
-- ("một con số") jar model — a jar's `budget_limit` IS its allocation now, so
-- there is no separate earmark ledger. `db.ts` drops the old table on connect.
