import "server-only";

import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";

const GOAL_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS user_goals (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL CHECK (target_amount > 0),
  target_date TEXT NOT NULL,
  flexibility TEXT NOT NULL CHECK (flexibility IN ('fixed','flexible')),
  monthly_contribution INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  jar_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (cif, id)
);

CREATE TABLE IF NOT EXISTS user_goal_ledger (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','withdraw')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'self_reported' CHECK (source = 'self_reported'),
  PRIMARY KEY (cif, id)
);
CREATE INDEX IF NOT EXISTS idx_user_goal_ledger_goal ON user_goal_ledger (cif, goal_id);
`;

/** Idempotent: creates the goal tables when missing. */
export function ensureGoalTables(db: Database.Database): void {
  db.exec(GOAL_TABLES_SQL);
  const cols = db.prepare("PRAGMA table_info(user_goals)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "request_key")) {
    try {
      db.exec("ALTER TABLE user_goals ADD COLUMN request_key TEXT");
    } catch (e) {
      if (!String(e).includes("duplicate column")) throw e; // lost a race with another handle
    }
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_user_goals_request_key
       ON user_goals (cif, request_key) WHERE request_key IS NOT NULL`,
  );
}

const ready = new WeakSet<Database.Database>();

/** Shared DB handle with the goal tables guaranteed, set up once per instance. */
export function goalsDb(): Database.Database {
  const db = getDb();
  if (!ready.has(db)) {
    ensureGoalTables(db);
    ready.add(db);
  }
  return db;
}
