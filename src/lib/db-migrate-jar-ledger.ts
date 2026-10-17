import "server-only";

/**
 * One-time migration for the jar LIMIT vs BALANCE split (plan
 * 260923-jar-limit-vs-balance-split, phase 01): every legacy jar gets a
 * `created_at` anchor and — when it has a limit — an opening deposit equal to
 * that limit, so its running balance starts where the old single-number model
 * left it. Wired into `getDb()` (`db.ts`) in this order:
 *
 *   needsJarLedgerMigration → backupDbFile → addJarsCreatedAtColumn
 *   → schema.sql → seedJarLedgerFromLimits
 *
 * Idempotent: only rows with `created_at IS NULL` are touched, and once none are
 * left `needsJarLedgerMigration` is false, so no second backup is ever taken.
 * Restore path: see `data/schema.md` ("Restoring a pre-migration backup").
 */

import type Database from "better-sqlite3";
import { copyFileSync } from "node:fs";
import { monthPeriodFromKey } from "@/domain/engine/types";
import { currentMonthKey } from "./demo-clock";

function jarColumns(db: Database.Database): { name: string }[] {
  return db.prepare("PRAGMA table_info(jars)").all() as { name: string }[];
}

/**
 * True when the `jars` table exists AND is legacy: it has no `created_at` column,
 * or some row still has `created_at IS NULL`. A fresh DB (no table yet) → false.
 */
export function needsJarLedgerMigration(db: Database.Database): boolean {
  const cols = jarColumns(db);
  if (cols.length === 0) return false;
  if (!cols.some((c) => c.name === "created_at")) return true;
  return db.prepare("SELECT 1 FROM jars WHERE created_at IS NULL LIMIT 1").get() !== undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock `YYYYMMDD-HHmmss` (local time) — the backup file suffix. */
export function backupStamp(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `${date}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Copy the DB file to `<dbPath>.bak-<YYYYMMDD-HHmmss>` BEFORE any ALTER. The WAL
 * is checkpointed first so the copy holds every committed write. A failed copy
 * THROWS — the migration never proceeds without a backup. Returns the backup path.
 */
export function backupDbFile(db: Database.Database, dbPath: string, now: Date = new Date()): string {
  const backupPath = `${dbPath}.bak-${backupStamp(now)}`;
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    copyFileSync(dbPath, backupPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`jar-ledger migration aborted: could not back up ${dbPath} (${reason})`);
  }
  return backupPath;
}

/**
 * Add `jars.created_at` to a legacy table. Runs BEFORE `schema.sql` (same pattern
 * as `addTransactionsSourceColumn`). No-op when the table does not exist yet or
 * already has the column. Nullable: SQLite cannot ADD a NOT NULL column without a
 * default, and the backfill below fills it.
 */
export function addJarsCreatedAtColumn(db: Database.Database): void {
  const cols = jarColumns(db);
  if (cols.length === 0 || cols.some((c) => c.name === "created_at")) return;
  db.exec("ALTER TABLE jars ADD COLUMN created_at TEXT");
}

/** The migration anchor: the start of the current DEMO month (not the wall clock). */
export function jarLedgerAnchorIso(): string {
  return monthPeriodFromKey(currentMonthKey()).from;
}

interface LegacyJarRow {
  cif: string;
  id: string;
  budget_limit: number | null;
}

/**
 * In ONE transaction, for every jar with `created_at IS NULL`: insert an opening
 * deposit (`is_opening = 1`, id `led-mig-<jarId>`) equal to its `budget_limit` —
 * 0 included — then stamp `created_at = anchorIso`. A NULL limit gets the anchor
 * but NO deposit, so its balance stays unknown (invariant #6). Returns the number
 * of opening deposits inserted.
 */
export function seedJarLedgerFromLimits(db: Database.Database, anchorIso: string): number {
  const select = db.prepare("SELECT cif, id, budget_limit FROM jars WHERE created_at IS NULL");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO jar_ledger (cif, id, jar_id, kind, amount, is_opening, created_at, source)
     VALUES (?, ?, ?, 'deposit', ?, 1, ?, 'self_reported')`,
  );
  const stamp = db.prepare("UPDATE jars SET created_at = ? WHERE created_at IS NULL");
  return db.transaction(() => {
    let inserted = 0;
    for (const row of select.all() as LegacyJarRow[]) {
      if (row.budget_limit === null) continue;
      const amount = Math.round(row.budget_limit);
      if (!Number.isSafeInteger(amount) || amount < 0) {
        console.warn(`jar-ledger migration: skipped opening deposit for ${row.cif}/${row.id} (invalid limit)`);
        continue;
      }
      inserted += insert.run(row.cif, `led-mig-${row.id}`, row.id, amount, anchorIso).changes;
    }
    stamp.run(anchorIso);
    return inserted;
  })();
}
