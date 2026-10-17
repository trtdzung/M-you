#!/usr/bin/env node
/**
 * Preserve a pre-per-CIF category table while upgrading it to data/schema.sql.
 * Run once against an old demo database; safe to re-run after migration.
 * A consistent SQLite backup is written before changing anything.
 */
import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.argv[2] || "data/pfm.sqlite3");
const db = new Database(dbPath, { fileMustExist: true });

try {
  const columns = db.prepare("PRAGMA table_info(categories)").all();
  if (columns.length === 0) throw new Error("categories table is missing");
  if (columns.some((column) => column.name === "cif")) {
    console.log("Categories already use the per-CIF schema; no migration needed.");
    process.exitCode = 0;
  } else {
    const categories = db.prepare("SELECT id, label, kind, fixed, sort_order FROM categories ORDER BY sort_order").all();
    const cifs = db.prepare(`
      SELECT cif FROM accounts
      UNION SELECT cif FROM beneficiaries
      UNION SELECT cif FROM jars
      UNION SELECT cif FROM transactions
      UNION SELECT cif FROM transaction_corrections
    `).all().map((row) => row.cif);
    if (cifs.length === 0) throw new Error("No CIFs found; refusing to replace categories");

    const backupPath = `${dbPath}.before-category-cif-${Date.now()}.bak`;
    await db.backup(backupPath);
    const builtIn = new Set([
      "housing", "utilities", "subscriptions", "insurance", "dining",
      "transport", "shopping", "groceries", "entertainment", "health", "transfer",
    ]);

    db.transaction(() => {
      db.exec(`
        CREATE TABLE categories_per_cif (
          cif TEXT NOT NULL,
          id TEXT NOT NULL,
          label TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('expense', 'transfer')),
          fixed INTEGER NOT NULL,
          custom INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          sort_order INTEGER NOT NULL,
          PRIMARY KEY (cif, id)
        )
      `);
      const insert = db.prepare(`
        INSERT INTO categories_per_cif
          (cif, id, label, kind, fixed, custom, archived_at, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
      `);
      for (const cif of cifs) {
        for (const row of categories) {
          insert.run(cif, row.id, row.label, row.kind, row.fixed, builtIn.has(row.id) ? 0 : 1, row.sort_order);
        }
      }
      const expected = cifs.length * categories.length;
      const actual = db.prepare("SELECT COUNT(*) AS n FROM categories_per_cif").get().n;
      if (actual !== expected) throw new Error(`Copied ${actual} categories; expected ${expected}`);
      db.exec("DROP TABLE categories");
      db.exec("ALTER TABLE categories_per_cif RENAME TO categories");
      db.exec("CREATE INDEX idx_categories_cif ON categories (cif, sort_order)");
    })();

    console.log(`Migrated ${categories.length} categories for ${cifs.length} CIFs. Backup: ${backupPath}`);
  }
} finally {
  db.close();
}
