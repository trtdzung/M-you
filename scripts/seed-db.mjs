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
// `role` mirrors the template's donor-waterfall role (U11) — the column must be
// seeded, or every seeded jar reads back role-less (engine default `spending`)
// and the "Tiết kiệm" buffer / "Thiết yếu" essential ordering is lost.
const SEED_JARS = [
  { id: "essentials", label: "Thiết yếu", categoryIds: ["housing", "utilities", "insurance", "subscriptions"], role: "essential", budgetLimit: 8_000_000 },
  { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"], role: "spending", budgetLimit: 4_000_000 },
  { id: "transport", label: "Di chuyển", categoryIds: ["transport"], role: "spending", budgetLimit: 1_500_000 },
  { id: "lifestyle", label: "Hưởng thụ", categoryIds: ["entertainment", "shopping"], role: "spending", budgetLimit: 2_500_000 },
  { id: "health", label: "Sức khỏe", categoryIds: ["health"], role: "spending", budgetLimit: 1_000_000 },
  { id: "savings", label: "Tiết kiệm", categoryIds: [], role: "buffer", budgetLimit: undefined },
];

// salaryBase per CIF, duplicated from src/providers/mock/personas.ts (same reason
// as SEED_BENEFICIARIES: plain .mjs, no TS loader). scale = salaryBase / 25tr —
// the SAME factor fixtures/generate.ts applies to the CASA balance (18tr × scale).
// Scaling the seed by it keeps Σ budgetLimit tracking CASA per persona
// (Σ/CASA ≈ 0.94, dư về "Chờ phân bổ") and fixes CIF_0002 over-allocation.
const SALARY_BASE_BY_CIF = {
  CIF_0001: 25_000_000,
  CIF_0002: 22_000_000,
  CIF_0003: 80_000_000,
  CIF_0004: 20_000_000, // "fresh" demo persona — income only, jars seeded with NULL limits
};
const SALARY_REF = 25_000_000;
const CIFS = Object.keys(SALARY_BASE_BY_CIF);

// Per-persona account metadata, duplicated from src/providers/mock/personas.ts
// + fixtures/generate.ts (same reason as above: plain .mjs, no TS loader). The
// account rows must match `buildPersonaAccounts` EXACTLY so the DB and the
// transaction fixtures never diverge — account id (`acc_<personaId>_<slot>`),
// balances (18tr/45tr/-8tr/50tr × scale), numbers and masks all derive from
// these seeds. `accounts-store.ts` seeds the same shape lazily; this script is
// just the committed-DB path.
const PERSONA_ACCOUNTS = {
  CIF_0001: { personaId: "stable", seed: 1001, tier: "M-FIRST GOLD" },
  CIF_0002: { personaId: "irregular", seed: 2002, tier: "M-FIRST" },
  CIF_0003: { personaId: "wealthy", seed: 3003, tier: "M-FIRST PRIVATE" },
  CIF_0004: { personaId: "fresh", seed: 4004, tier: "M-FIRST" },
};
const ACCT_SYNCED_AT = "2026-09-15T00:00:00.000Z";

// acctNumber(seed, salt) — mirrors fixtures/generate.ts.
const acctNumber = (seed, salt) =>
  String((seed * 1_000_003 + salt * 97) % 1_000_000_000_000).padStart(12, "0");
// maskAccountNumber — mirrors src/lib/format.ts (`•••• last4`).
const maskAccount = (number) => {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits ? `•••• ${digits.slice(-4)}` : "••••";
};

/** The three MSB accounts for a persona (current, savings, credit_card). */
function buildAccountRows(cif) {
  const { personaId, seed, tier } = PERSONA_ACCOUNTS[cif];
  const scale = SALARY_BASE_BY_CIF[cif] / SALARY_REF;
  const row = (slot, salt, type, balance, availableBalance, accTier) => ({
    cif,
    id: `acc_${personaId}_${slot}`,
    type,
    institution: "MSB",
    currency: "VND",
    balance: Math.round(balance),
    availableBalance: Math.round(availableBalance),
    lastSyncedAt: ACCT_SYNCED_AT,
    source: "msb",
    tier: accTier,
    maskedNumber: maskAccount(acctNumber(seed, salt)),
    accountNumber: acctNumber(seed, salt),
  });
  return [
    row("current", 1, "current", 18_000_000 * scale, 18_000_000 * scale, tier),
    row("savings", 2, "savings", 45_000_000 * scale, 45_000_000 * scale, null),
    row("credit", 3, "credit_card", -8_000_000 * scale, 50_000_000 * scale, null),
  ];
}

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

// Older DB files predate `jars.role` (CREATE TABLE IF NOT EXISTS won't add it) —
// same idempotent migration as src/lib/db.ts, so the INSERT below never fails.
try {
  db.exec("ALTER TABLE jars ADD COLUMN role TEXT");
} catch {
  // column already exists
}
// Only the seeded personas' jars are replaced (K08) — any other cif's jars
// (synthetic test personas, user-created data) survive a reseed.
const deleteJarsOfCif = db.prepare("DELETE FROM jars WHERE cif = ?");
const insertJar = db.prepare(
  `INSERT INTO jars (id, cif, label, category_ids, budget_limit, role, color, icon, sort_order)
   VALUES (@id, @cif, @label, @categoryIds, @budgetLimit, @role, NULL, NULL, @sortOrder)`,
);
const insertAllJars = db.transaction(() => {
  for (const cif of CIFS) {
    deleteJarsOfCif.run(cif);
    const scale = SALARY_BASE_BY_CIF[cif] / SALARY_REF;
    SEED_JARS.forEach((jar, index) => {
      // Scale each jar's single number by the persona's factor; an unset limit
      // (savings) stays NULL — never coerced to 0 (invariant #6). The "fresh"
      // persona seeds EVERY jar with a NULL limit — a new user who hasn't set
      // any hạn mức yet.
      const scaledLimit =
        cif === "CIF_0004" || jar.budgetLimit === undefined ? null : Math.round(jar.budgetLimit * scale);
      insertJar.run({
        id: jar.id,
        cif,
        label: jar.label,
        categoryIds: JSON.stringify(jar.categoryIds),
        budgetLimit: scaledLimit,
        role: jar.role,
        sortOrder: index,
      });
    });
  }
});
insertAllJars();
console.log(`Seeded ${SEED_JARS.length} jars × ${CIFS.length} personas into ${DB_PATH}`);

db.exec("DELETE FROM accounts");
const insertAccount = db.prepare(
  `INSERT INTO accounts
     (cif, id, type, institution, currency, balance, available_balance, last_synced_at, source, tier, masked_number, account_number, sort_order)
   VALUES (@cif, @id, @type, @institution, @currency, @balance, @availableBalance, @lastSyncedAt, @source, @tier, @maskedNumber, @accountNumber, @sortOrder)`,
);
const insertAllAccounts = db.transaction(() => {
  for (const cif of CIFS) {
    buildAccountRows(cif).forEach((account, index) => {
      insertAccount.run({ ...account, sortOrder: index });
    });
  }
});
insertAllAccounts();
console.log(`Seeded 3 accounts × ${CIFS.length} personas into ${DB_PATH}`);

// Transaction history comes from the TypeScript generator (fixtures/generate.ts),
// which this plain .mjs script can't import. Clearing the table is enough: the
// server's `transactions-store.ts` re-seeds each persona from that generator on
// its first read, so history always matches the freshly seeded accounts.
// Labels key on those transaction ids, so they reset together. The category
// taxonomy (`categories`) is left alone — it is seeded lazily from code.
db.exec("DELETE FROM transactions");
db.exec("DELETE FROM transaction_corrections");
console.log(`Cleared transactions + labels (re-seeded per persona on first read) in ${DB_PATH}`);

// WAL mode buffers writes in a separate -wal file; checkpoint before closing
// so the committed .sqlite3 file itself reflects this run's data.
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
