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
