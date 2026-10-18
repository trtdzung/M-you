import "server-only";

import type { Transaction } from "@/domain/models";
import { buildPersonaAccounts, generateDataset } from "@/providers/mock/fixtures/generate";
import { PERSONA_LIST, type PersonaMeta } from "@/providers/mock/personas";
import { getDb } from "@/lib/db";

/** Persona that can surface an investment card once its stored books match the fixture. */
const CIF = "CIF_0003";
const VERSION = 1;
/** Kept above the discovery threshold after the buffer and predicted bills. */
const SURPLUS_VND = 120_000_000;
const DEMO_MONTH = "2026-09";
/** Lifestyle categories. Full pace projects the jar empty before month end. */
const LIFESTYLE = new Set(["entertainment", "shopping"]);

/**
 * Pull expense days back to the 8th so no recurring bill falls inside the
 * demo week's payment window (the clock is 15 Sep). Same calendar month.
 */
function pullExpenseDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() <= 14) return iso;
  date.setUTCDate(8);
  return date.toISOString();
}

function presentForInsight(txn: Transaction): Transaction {
  if (txn.type !== "expense" || txn.status !== "posted") return txn;
  const postedAt = pullExpenseDay(txn.postedAt);
  const categoryId = txn.categoryId === "unclassified" && postedAt.startsWith(DEMO_MONTH) ? "dining" : txn.categoryId;
  const amount = LIFESTYLE.has(categoryId) ? Math.max(1_000, Math.round(txn.amount * 0.25)) : txn.amount;
  return { ...txn, postedAt, categoryId, amount };
}

/**
 * Debts must be known (rate under 20%, due date outside the 30-day reserve)
 * and the house goal funded, or the existing surplus rule stays at zero.
 * Applied in memory: the snapshot reads liabilities and goals from the persona.
 */
function alignWealthyBooks(persona: PersonaMeta): void {
  for (const liability of persona.liabilities) {
    liability.dueDate = "2026-11-20";
    if (liability.id === "l_w_card") liability.interestRate = 0.12;
  }
  for (const goal of persona.goals) {
    if (goal.id === "g_w_house") goal.currentAmount = goal.targetAmount;
  }
}

/**
 * One-time rewrite of the wealthy persona's bank history and current-account
 * balance so `buildCustomerSnapshot` emits `investment:discovery` from the
 * existing rule. Self-reported rows are left alone.
 */
export function ensureInvestmentFixture(cif: string): void {
  if (cif !== CIF) return;
  const persona = PERSONA_LIST.find((item) => item.cif === cif);
  if (persona) alignWealthyBooks(persona);
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS investment_fixture (
    cif TEXT PRIMARY KEY, version INTEGER NOT NULL
  )`);
  const saved = db.prepare("SELECT version FROM investment_fixture WHERE cif = ?").get(cif) as { version: number } | undefined;
  if (saved?.version === VERSION) return;
  const current = persona ? buildPersonaAccounts(persona).find((account) => account.type === "current") : undefined;
  if (!persona || !current) return;
  const ready = db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE cif = ? AND type = 'current'").get(cif) as { n: number };
  if (ready.n === 0) return;
  const transactions = generateDataset(persona).transactions.map(presentForInsight);
  db.transaction(() => {
    db.prepare("DELETE FROM transactions WHERE cif = ? AND source <> 'self_reported'").run(cif);
    const insert = db.prepare(
      "INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (@cif, @id, 'mock', @postedAt, @payload)",
    );
    for (const txn of transactions) {
      insert.run({ cif, id: txn.id, postedAt: txn.postedAt, payload: JSON.stringify(txn) });
    }
    db.prepare("UPDATE accounts SET balance = ?, available_balance = ? WHERE cif = ? AND type = 'current'")
      .run(current.balance + SURPLUS_VND, current.availableBalance + SURPLUS_VND, cif);
    db.prepare(
      `INSERT INTO investment_fixture (cif, version) VALUES (?, ?)
       ON CONFLICT(cif) DO UPDATE SET version = excluded.version`,
    ).run(cif, VERSION);
  })();
}
