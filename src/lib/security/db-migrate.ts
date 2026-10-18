import type Database from "better-sqlite3";

/**
 * Scam Shield engine migrations for DB files created by an earlier engine task:
 * `CREATE TABLE IF NOT EXISTS` never adds a column to an existing table.
 * Idempotent; called from `getDb()` after `schema.sql` runs.
 */
export function migrateSecurityEngine(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(security_engine_state)").all() as { name: string }[];
  if (columns.length && !columns.some(c => c.name === "account_opened_at")) {
    db.exec("ALTER TABLE security_engine_state ADD COLUMN account_opened_at INTEGER");
  }
}
