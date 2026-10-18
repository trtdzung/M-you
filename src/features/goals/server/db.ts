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

CREATE TABLE IF NOT EXISTS user_goal_jars (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cif, id),
  UNIQUE (cif, goal_id)
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

-- Proactive notes already shown (feature-owned; nothing here is bank data).
CREATE TABLE IF NOT EXISTS user_goal_reminders (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  dismissed_at TEXT,
  PRIMARY KEY (cif, id)
);
CREATE INDEX IF NOT EXISTS idx_user_goal_reminders_goal ON user_goal_reminders (cif, goal_id, created_at);
`;

/** Idempotent: creates the goal tables when missing. */
export function ensureGoalTables(db: Database.Database): void {
  db.exec(GOAL_TABLES_SQL);
  const cols = db.prepare("PRAGMA table_info(user_goals)").all() as { name: string }[];
  for (const col of ["request_key", "paused_until"]) {
    if (cols.some((c) => c.name === col)) continue;
    try {
      db.exec(`ALTER TABLE user_goals ADD COLUMN ${col} TEXT`);
    } catch (e) {
      if (!String(e).includes("duplicate column")) throw e; // lost a race with another handle
    }
  }
  // One dedicated accumulation jar per goal, including goals created before this feature.
  db.transaction(() => {
    db.exec(`UPDATE user_goals SET jar_id = 'goaljar_' || id WHERE jar_id IS NULL;
      INSERT OR IGNORE INTO user_goal_jars (cif, id, goal_id, created_at)
      SELECT cif, jar_id, id, created_at FROM user_goals;`);
  })();
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
