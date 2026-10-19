import "server-only";

import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";

const GOAL_V2_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS gv2_goals (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cif, id)
);

CREATE TABLE IF NOT EXISTS gv2_goal_accounts (
  cif TEXT NOT NULL,
  account_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  interest_rate_pa REAL NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  PRIMARY KEY (cif, account_id)
);

CREATE TABLE IF NOT EXISTS gv2_txn_kinds (
  cif TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (cif, txn_id)
);
CREATE INDEX IF NOT EXISTS idx_gv2_txn_kinds_goal ON gv2_txn_kinds (cif, goal_id);

CREATE TABLE IF NOT EXISTS gv2_assets (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (cif, id)
);

CREATE TABLE IF NOT EXISTS gv2_loans (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (cif, id)
);

CREATE TABLE IF NOT EXISTS gv2_meta (
  cif TEXT PRIMARY KEY,
  seq INTEGER NOT NULL DEFAULT 0,
  processed_through TEXT,
  fund_price_shift_pct REAL NOT NULL DEFAULT 0,
  risk_profile TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS gv2_action_log (
  cif TEXT NOT NULL,
  request_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cif, request_id)
);

CREATE TABLE IF NOT EXISTS gv2_prices (
  instrument_id TEXT NOT NULL,
  price_date TEXT NOT NULL,
  price REAL NOT NULL,
  raw_price REAL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (instrument_id, price_date)
);
CREATE INDEX IF NOT EXISTS idx_gv2_prices_instrument_date ON gv2_prices (instrument_id, price_date);

CREATE TABLE IF NOT EXISTS gv2_instruments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  fractional INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  external_ref TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gv2_price_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','ok','partial','failed')),
  detail TEXT
);

CREATE TABLE IF NOT EXISTS gv2_suggestions (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  dismissed_until TEXT,
  ignored_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cif, id)
);
CREATE INDEX IF NOT EXISTS idx_gv2_suggestions_goal ON gv2_suggestions (cif, goal_id);

CREATE TABLE IF NOT EXISTS gv2_suggestion_events (
  cif TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('shown','clicked','dismissed','acted')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gv2_transfer_sources (
  cif TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  source_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cif, txn_id)
);
`;

/** Idempotent: creates every Goals v2 table when missing. */
export function ensureGoalV2Tables(db: Database.Database): void {
  db.exec(GOAL_V2_TABLES_SQL);
  const cols = db.prepare("PRAGMA table_info(gv2_meta)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "risk_profile_asked_at")) db.exec("ALTER TABLE gv2_meta ADD COLUMN risk_profile_asked_at TEXT");
  const logCols = db.prepare("PRAGMA table_info(gv2_action_log)").all() as { name: string }[];
  if (!logCols.some((c) => c.name === "created_goal_id")) db.exec("ALTER TABLE gv2_action_log ADD COLUMN created_goal_id TEXT");
}

const ready = new WeakSet<Database.Database>();

/** Shared DB handle with the Goals v2 tables guaranteed, set up once per instance. */
export function goalsV2Db(): Database.Database {
  const db = getDb();
  if (!ready.has(db)) {
    ensureGoalV2Tables(db);
    ready.add(db);
  }
  return db;
}
