/** Add one opportunity demo persona's jars without resetting any existing CIF. */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const db = new Database(path.join(root, "data", "pfm.sqlite3"));
db.pragma("journal_mode = WAL");
db.exec(readFileSync(path.join(root, "data", "schema.sql"), "utf8"));
const cif = "CIF_0005";
const rows = JSON.parse(readFileSync(path.join(root, "data", "seed-jars.json"), "utf8"));
const count = db.prepare("SELECT count(*) AS n FROM jars WHERE cif = ?").get(cif).n;
if (count === 0) {
  const insert = db.prepare(`INSERT INTO jars
    (id, cif, label, category_ids, budget_limit, color, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`);
  db.transaction(() => rows.forEach((jar, index) => insert.run(
    jar.id, cif, jar.label, JSON.stringify(jar.categoryIds), jar.budgetLimit ?? null, index,
  )))();
  console.log(`Added ${rows.length} jars for ${cif}`);
} else {
  console.log(`Kept ${count} existing jars for ${cif}`);
}
db.close();
