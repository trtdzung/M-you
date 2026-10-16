#!/usr/bin/env node
/**
 * (Re)creates data/pfm.sqlite3 from data/schema.sql and seeds the 3
 * prototype personas' saved-recipient accounts. Drops and reseeds the
 * `beneficiaries` table every run — a dev/demo convenience, not a migration
 * tool (see data/schema.md). Run with `npm run db:seed`.
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH = path.join(ROOT, "data", "pfm.sqlite3");
const SCHEMA_PATH = path.join(ROOT, "data", "schema.sql");

const NOW = new Date().toISOString();

const SEED_BENEFICIARIES = [
  // CIF_0001 — Minh, Lương ổn định (persona "stable")
  { id: "b_stable_lan", cif: "CIF_0001", name: "Nguyễn Thị Lan", accountNumber: "19012345678901", bankName: "MSB" },
  { id: "b_stable_binh", cif: "CIF_0001", name: "Trần Văn Bình", accountNumber: "0071000123456", bankName: "Vietcombank" },
  { id: "b_stable_landlord", cif: "CIF_0001", name: "Chủ nhà Phạm Văn Đức", accountNumber: "12010009988776", bankName: "MSB" },
  // CIF_0002 — Lan, Thu nhập biến động (persona "irregular")
  { id: "b_irr_khang", cif: "CIF_0002", name: "Đỗ Minh Khang", accountNumber: "19088776655443", bankName: "MSB" },
  { id: "b_irr_studio", cif: "CIF_0002", name: "Studio Ánh Dương", accountNumber: "0451000778899", bankName: "Techcombank" },
  // CIF_0003 — Hùng, Tài sản cao (persona "wealthy")
  { id: "b_w_quan", cif: "CIF_0003", name: "Vũ Đình Quân", accountNumber: "19055443322110", bankName: "MSB" },
  { id: "b_w_broker", cif: "CIF_0003", name: "Công ty CP Đầu tư An Phú", accountNumber: "0331000445566", bankName: "BIDV" },
  { id: "b_w_hoa", cif: "CIF_0003", name: "Lê Thị Hoa", accountNumber: "0071000998877", bankName: "Vietcombank" },
];

// The "Cá nhân" 6-jar template (src/domain/models/jar-defaults.ts) — duplicated
// here rather than imported, same reasoning as SEED_BENEFICIARIES above (this
// is a plain .mjs script, no TS loader configured).
const SEED_JARS = [
  { id: "essentials", label: "Thiết yếu", categoryIds: ["housing", "utilities", "insurance", "subscriptions"], budgetLimit: 8_000_000 },
  { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"], budgetLimit: 4_000_000 },
  { id: "transport", label: "Di chuyển", categoryIds: ["transport"], budgetLimit: 1_500_000 },
  { id: "lifestyle", label: "Hưởng thụ", categoryIds: ["entertainment", "shopping"], budgetLimit: 2_500_000 },
  { id: "health", label: "Sức khỏe", categoryIds: ["health"], budgetLimit: 1_000_000 },
  { id: "savings", label: "Tiết kiệm", categoryIds: [], budgetLimit: undefined },
];
const CIFS = ["CIF_0001", "CIF_0002", "CIF_0003"];

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(readFileSync(SCHEMA_PATH, "utf8"));

db.exec("DELETE FROM beneficiaries");
const insert = db.prepare(
  `INSERT INTO beneficiaries (id, cif, name, account_number, bank_name, source, created_at)
   VALUES (@id, @cif, @name, @accountNumber, @bankName, 'mock', @createdAt)`,
);
const insertAll = db.transaction((rows) => {
  for (const row of rows) insert.run({ ...row, createdAt: NOW });
});
insertAll(SEED_BENEFICIARIES);

console.log(`Seeded ${SEED_BENEFICIARIES.length} beneficiaries into ${DB_PATH}`);

db.exec("DELETE FROM jars");
const insertJar = db.prepare(
  `INSERT INTO jars (id, cif, label, category_ids, budget_limit, actual_amount, color, icon, sort_order)
   VALUES (@id, @cif, @label, @categoryIds, @budgetLimit, @actualAmount, NULL, NULL, @sortOrder)`,
);
const insertAllJars = db.transaction(() => {
  for (const cif of CIFS) {
    SEED_JARS.forEach((jar, index) => {
      insertJar.run({
        id: jar.id,
        cif,
        label: jar.label,
        categoryIds: JSON.stringify(jar.categoryIds),
        budgetLimit: jar.budgetLimit ?? null,
        actualAmount: jar.budgetLimit ?? null, // backfilled at seed time too
        sortOrder: index,
      });
    });
  }
});
insertAllJars();
console.log(`Seeded ${SEED_JARS.length} jars × ${CIFS.length} personas into ${DB_PATH}`);

// WAL mode buffers writes in a separate -wal file; checkpoint before closing
// so the committed .sqlite3 file itself reflects this run's data.
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
