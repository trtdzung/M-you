// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * One-table transactions migration (`db.ts`): an older DB with a source-less
 * `transactions` + a separate `manual_transactions` table ends up as ONE table —
 * bank rows tagged `mock`, manual rows moved in as `self_reported`, the legacy
 * table dropped, and a manual row colliding with a bank id never overwrites it.
 */

vi.mock("server-only", () => ({}));

import { addTransactionsSourceColumn, mergeManualTransactions } from "../db";

const SCHEMA = readFileSync(join(process.cwd(), "data", "schema.sql"), "utf8");

function legacyDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE transactions (cif TEXT NOT NULL, id TEXT NOT NULL, posted_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (cif, id));
           CREATE TABLE manual_transactions (cif TEXT NOT NULL, id TEXT NOT NULL, posted_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (cif, id));`);
  const bank = db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?)");
  bank.run("C1", "bank-1", "2026-09-01", '{"bank":1}');
  bank.run("C1", "dup", "2026-09-02", '{"bank":2}');
  const manual = db.prepare("INSERT INTO manual_transactions VALUES (?, ?, ?, ?)");
  manual.run("C1", "manual-1", "2026-09-03", '{"manual":1}');
  manual.run("C1", "dup", "2026-09-04", '{"manual":2}');
  return db;
}

/** The exact getDb() order: column → schema → merge. */
function migrate(db: Database.Database): void {
  addTransactionsSourceColumn(db);
  db.exec(SCHEMA);
  mergeManualTransactions(db);
}

const rows = (db: Database.Database) =>
  db.prepare("SELECT id, source, payload FROM transactions ORDER BY id").all() as { id: string; source: string; payload: string }[];

describe("one-table transactions migration", () => {
  it("tags bank rows mock, moves manual rows in as self_reported, drops the legacy table", () => {
    const db = legacyDb();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    migrate(db);
    expect(rows(db)).toEqual([
      { id: "bank-1", source: "mock", payload: '{"bank":1}' },
      { id: "dup", source: "mock", payload: '{"bank":2}' }, // bank row never overwritten
      { id: "manual-1", source: "self_reported", payload: '{"manual":1}' },
    ]);
    expect(warn).toHaveBeenCalledOnce();
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'manual_transactions'").get()).toBeUndefined();
    warn.mockRestore();
  });

  it("is idempotent and a no-op on a fresh DB", () => {
    const db = legacyDb();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    migrate(db);
    const once = rows(db);
    migrate(db);
    expect(rows(db)).toEqual(once);

    const fresh = new Database(":memory:");
    migrate(fresh);
    expect(rows(fresh)).toEqual([]);
  });
});
