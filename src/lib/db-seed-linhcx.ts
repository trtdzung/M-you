import type Database from "better-sqlite3";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { jarLedgerAnchorIso } from "./db-migrate-jar-ledger";

/** Add the fourth demo customer's authored defaults once; never copy mutable customer books. */
export function seedLinhcxDefaults(db: Database.Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS demo_customer_defaults (cif TEXT PRIMARY KEY)");
  const cif = "CIF_0004";
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM demo_customer_defaults WHERE cif = ?").get(cif)) return;
    const createdAt = jarLedgerAnchorIso();
    const beneficiaries = [
      ["lan", "Nguyễn Thị Lan", "19012345678901", "MSB"],
      ["binh", "Trần Văn Bình", "0071000123456", "Vietcombank"],
      ["landlord", "Chủ nhà Phạm Văn Đức", "12010009988776", "MSB"],
    ];
    const insertBeneficiary = db.prepare(`INSERT OR IGNORE INTO beneficiaries
      (id, cif, name, account_number, bank_name, source, created_at) VALUES (?, ?, ?, ?, ?, 'mock', ?)`);
    // Existing fourth-customer data is also preserved if a seed script already ran.
    if (!db.prepare("SELECT 1 FROM beneficiaries WHERE cif = ?").get(cif)) {
      for (const [id, name, account, bank] of beneficiaries) {
        insertBeneficiary.run(`b_linhcx_${id}`, cif, name, account, bank, createdAt);
      }
    }
    if (!db.prepare("SELECT 1 FROM jars WHERE cif = ?").get(cif)) {
      const insertJar = db.prepare(`INSERT OR IGNORE INTO jars
        (id, cif, label, category_ids, budget_limit, color, icon, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`);
      const insertOpening = db.prepare(`INSERT OR IGNORE INTO jar_ledger
        (cif, id, jar_id, kind, amount, is_opening, created_at, source)
        VALUES (?, ?, ?, 'deposit', ?, 1, ?, 'self_reported')`);
      DEFAULT_JAR_CONFIG.jars.forEach((jar, index) => {
        const id = `linhcx_${jar.id}`;
        const limit = jar.budgetLimit === undefined ? null : Math.round(jar.budgetLimit * 30_000_000 / 25_000_000);
        insertJar.run(id, cif, jar.label, JSON.stringify(jar.categoryIds), limit, index, createdAt);
        if (limit !== null) insertOpening.run(cif, `led-seed-${id}`, id, limit, createdAt);
      });
    }
    db.prepare("INSERT INTO demo_customer_defaults (cif) VALUES (?)").run(cif);
  })();
}
