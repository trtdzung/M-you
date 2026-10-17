// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * Jar limit-vs-balance migration (`db-migrate-jar-ledger.ts`, wired into
 * `getDb()`): a legacy `jars` table gains `created_at` and one opening deposit
 * per non-NULL limit (0 included), a backup is taken first and only when needed,
 * a failed backup aborts, and a second run is a no-op. Temp/in-memory DBs only —
 * never `data/pfm.sqlite3`.
 */

vi.mock("server-only", () => ({}));

import {
  addJarsCreatedAtColumn,
  backupDbFile,
  backupStamp,
  jarLedgerAnchorIso,
  needsJarLedgerMigration,
  seedJarLedgerFromLimits,
} from "../db-migrate-jar-ledger";

const SCHEMA = readFileSync(join(process.cwd(), "data", "schema.sql"), "utf8");
const ANCHOR = "2026-08-31T17:00:00.000Z"; // 00:00 01/09/2026 VN — the demo month start

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A pre-migration `jars` table (no `created_at`) with a set, a zero and an unset limit. */
function legacyJars(db: Database.Database): Database.Database {
  db.exec(`CREATE TABLE jars (id TEXT NOT NULL, cif TEXT NOT NULL, label TEXT NOT NULL, category_ids TEXT NOT NULL,
           budget_limit REAL, color TEXT, icon TEXT, sort_order INTEGER NOT NULL, PRIMARY KEY (cif, id));`);
  const ins = db.prepare("INSERT INTO jars VALUES (?, ?, ?, '[]', ?, NULL, NULL, ?)");
  ins.run("food", "C1", "Ăn uống", 5_000_000, 0);
  ins.run("fun", "C1", "Giải trí", 0, 1);
  ins.run("save", "C1", "Tiết kiệm", null, 2);
  ins.run("food", "C2", "Ăn uống", 3_000_000, 0);
  return db;
}

function tempFileDb(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "jar-ledger-mig-"));
  tempDirs.push(dir);
  const dbPath = join(dir, "pfm.sqlite3");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return { db, dbPath, dir };
}

/** The exact getDb() order: needs → backup → column → schema → seed. */
function migrate(db: Database.Database, dbPath: string): boolean {
  const needed = needsJarLedgerMigration(db);
  if (needed) backupDbFile(db, dbPath);
  addJarsCreatedAtColumn(db);
  db.exec(SCHEMA);
  if (needed) seedJarLedgerFromLimits(db, ANCHOR);
  return needed;
}

const ledger = (db: Database.Database) =>
  db.prepare("SELECT cif, id, jar_id, kind, amount, is_opening, created_at, source FROM jar_ledger ORDER BY cif, jar_id").all();
const anchors = (db: Database.Database) =>
  db.prepare("SELECT cif, id, created_at FROM jars ORDER BY cif, id").all() as { created_at: string | null }[];
const backups = (dir: string) => readdirSync(dir).filter((f) => f.includes(".bak-"));

describe("jar-ledger migration", () => {
  it("anchors at the start of the current demo month", () => {
    expect(jarLedgerAnchorIso()).toBe(ANCHOR);
  });

  it("adds one opening deposit per non-NULL limit (0 included), none for NULL, and stamps every jar", () => {
    const { db, dbPath } = tempFileDb();
    legacyJars(db);
    expect(migrate(db, dbPath)).toBe(true);
    const row = (cif: string, jarId: string, amount: number) => ({
      cif, id: `led-mig-${jarId}`, jar_id: jarId, kind: "deposit", amount, is_opening: 1, created_at: ANCHOR, source: "self_reported",
    });
    expect(ledger(db)).toEqual([row("C1", "food", 5_000_000), row("C1", "fun", 0), row("C2", "food", 3_000_000)]);
    expect(anchors(db).every((r) => r.created_at === ANCHOR)).toBe(true);
    db.close();
  });

  it("backs up exactly once: the second run is a no-op with no new backup", () => {
    const { db, dbPath, dir } = tempFileDb();
    legacyJars(db);
    migrate(db, dbPath);
    expect(backups(dir)).toHaveLength(1);
    const before = { l: ledger(db), a: anchors(db) };
    expect(migrate(db, dbPath)).toBe(false);
    expect(backups(dir)).toHaveLength(1);
    expect({ l: ledger(db), a: anchors(db) }).toEqual(before);
    db.close();
  });

  it("the backup is a pre-migration copy (no created_at column, no ledger)", () => {
    const { db, dbPath, dir } = tempFileDb();
    legacyJars(db);
    migrate(db, dbPath);
    db.close();
    const copy = new Database(join(dir, backups(dir)[0]), { readonly: true });
    const cols = copy.prepare("PRAGMA table_info(jars)").all() as { name: string }[];
    expect(cols.some((c) => c.name === "created_at")).toBe(false);
    expect((copy.prepare("SELECT COUNT(*) AS n FROM jars").get() as { n: number }).n).toBe(4);
    expect(copy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'jar_ledger'").get()).toBeUndefined();
    copy.close();
  });

  it("takes no backup on a fresh DB (no jars table yet)", () => {
    const { db, dbPath, dir } = tempFileDb();
    expect(migrate(db, dbPath)).toBe(false);
    expect(backups(dir)).toEqual([]);
    expect(ledger(db)).toEqual([]);
    db.close();
  });

  it("migrates rows left with created_at IS NULL even when the column exists", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA);
    db.prepare("INSERT INTO jars (id, cif, label, category_ids, budget_limit, sort_order, created_at) VALUES ('a','C1','A','[]',100,0,'2026-09-10T00:00:00.000Z')").run();
    expect(needsJarLedgerMigration(db)).toBe(false);
    db.prepare("INSERT INTO jars (id, cif, label, category_ids, budget_limit, sort_order) VALUES ('b','C1','B','[]',200,1)").run();
    expect(needsJarLedgerMigration(db)).toBe(true);
    expect(seedJarLedgerFromLimits(db, ANCHOR)).toBe(1);
    expect(anchors(db).map((r) => r.created_at)).toEqual(["2026-09-10T00:00:00.000Z", ANCHOR]); // existing anchor untouched
  });

  it("a failed backup aborts: throws before any schema change", () => {
    const db = legacyJars(new Database(":memory:"));
    const missing = join(tmpdir(), "no-such-dir-jar-ledger", "pfm.sqlite3");
    expect(() => migrate(db, missing)).toThrow(/migration aborted/);
    const cols = db.prepare("PRAGMA table_info(jars)").all() as { name: string }[];
    expect(cols.some((c) => c.name === "created_at")).toBe(false);
    expect(existsSync(`${missing}.bak-${backupStamp(new Date())}`)).toBe(false);
  });

  it("backup stamp is YYYYMMDD-HHmmss", () => {
    expect(backupStamp(new Date(2026, 8, 3, 4, 5, 6))).toBe("20260903-040506");
  });
});

describe("jar_ledger constraints", () => {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  const ins = db.prepare(
    "INSERT INTO jar_ledger (cif, id, jar_id, kind, amount, is_opening, created_at) VALUES (?, ?, ?, ?, ?, ?, '2026-09-01T00:00:00.000Z')",
  );

  it("rejects a 0 amount on a non-opening row and a negative amount", () => {
    expect(() => ins.run("C1", "x1", "food", "deposit", 0, 0)).toThrow(/CHECK/);
    expect(() => ins.run("C1", "x2", "food", "withdraw", -5, 0)).toThrow(/CHECK/);
  });

  it("rejects an opening withdraw and an out-of-range is_opening", () => {
    expect(() => ins.run("C1", "x3", "food", "withdraw", 10, 1)).toThrow(/CHECK/);
    expect(() => ins.run("C1", "x4", "food", "deposit", 10, 2)).toThrow(/CHECK/);
  });

  it("allows one 0 opening row per jar and rejects a second opening row", () => {
    ins.run("C1", "o1", "food", "deposit", 0, 1);
    expect(() => ins.run("C1", "o2", "food", "deposit", 50, 1)).toThrow(/UNIQUE/);
    ins.run("C2", "o1", "food", "deposit", 50, 1); // another cif is independent
    ins.run("C1", "d1", "food", "deposit", 50, 0); // regular rows are unlimited
    expect(() => db.prepare("INSERT INTO jar_ledger (cif, id, jar_id, kind, amount, created_at, source) VALUES ('C1','s','food','deposit',1,'t','mock')").run()).toThrow(/CHECK/);
  });
});
