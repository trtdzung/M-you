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
-- categories with an optional monthly limit (`budget_limit`) and an optional
-- real balance (`actual_amount`); NULL in either means "chưa đặt"/"chưa có" —
-- never a silent 0 (invariant #6). Every expense category belongs to exactly
-- one jar, enforced server-side by the /api/jars route handlers.
CREATE TABLE IF NOT EXISTS jars (
  id TEXT NOT NULL,
  cif TEXT NOT NULL,
  label TEXT NOT NULL,
  category_ids TEXT NOT NULL,      -- JSON array of category id strings
  budget_limit REAL,               -- NULL = "chưa đặt" (Đã set), never 0
  actual_amount REAL,              -- NULL = "chưa có số dư" (Thực tế), never 0
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL,     -- display order (a jar added later sorts last)
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_jars_cif ON jars (cif);

-- Envelope allocations ("phân bổ thu nhập vào hũ"), per persona (`cif`). Each row
-- records that part of an income transaction (`txn_id`) was allocated into a jar
-- (`jar_id`) for `amount` VND. Keyed to a concrete transaction so "N GD chưa vào
-- hũ" is an exact ledger count, not a proxy. Append-only bookkeeping of money the
-- user already received — never a money movement (invariant #3). The funded
-- balance the Overview widget shows is DERIVED from these rows by the engine, not
-- stored in `jars.actual_amount` (which remains the Chuyển-tiền spendable balance).
CREATE TABLE IF NOT EXISTS jar_allocations (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  jar_id TEXT NOT NULL,
  amount REAL NOT NULL,             -- VND allocated (> 0)
  source TEXT NOT NULL CHECK (source IN ('msb', 'self_reported', 'estimated', 'mock')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jar_allocations_cif ON jar_allocations (cif);
