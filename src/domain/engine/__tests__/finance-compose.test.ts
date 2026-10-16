import { describe, expect, it } from "vitest";
import { getProviders, type PersonaId } from "@/providers";
import { DEMO_NOW, prevMonthKey } from "@/lib/demo-clock";
import {
  aggregateCashflow,
  calculateNetWorth,
  detectRecurring,
  evaluateBudget,
  monthPeriodFromKey,
  spendingByCategory,
  upcomingObligations,
} from "..";
import { computeFinancials, type RawData } from "../finance-compose";

/** Load a persona's raw provider bundle (server-style, no React). */
async function loadRaw(personaId: PersonaId): Promise<RawData> {
  const p = getProviders(personaId);
  const [transactions, accounts, assets, liabilities, budgets, snapshots, goals, products] =
    await Promise.all([
      p.listTransactions(),
      p.listAccounts(),
      p.listAssets(),
      p.listLiabilities(),
      p.getBudgets(),
      p.getMonthlySnapshots(),
      p.listGoals(),
      p.listMockProducts(),
    ]);
  return { transactions, accounts, assets, liabilities, budgets, snapshots, goals, products };
}

const MONTH = "2026-09";

describe("computeFinancials", () => {
  it("matches the hook's per-field composition (no regression)", async () => {
    const raw = await loadRaw("stable");
    const f = computeFinancials(raw, MONTH);

    const period = monthPeriodFromKey(MONTH);
    const prevPeriod = monthPeriodFromKey(prevMonthKey(MONTH));
    const recurring = detectRecurring(raw.transactions);

    expect(f.monthKey).toBe(MONTH);
    expect(f.cashflow).toEqual(aggregateCashflow(raw.transactions, period));
    expect(f.prevCashflow).toEqual(aggregateCashflow(raw.transactions, prevPeriod));
    expect(f.networth).toEqual(calculateNetWorth(raw.assets, raw.liabilities));
    expect(f.budgetLines).toEqual(evaluateBudget(raw.budgets, raw.transactions, period, DEMO_NOW));
    expect(f.categorySpend).toEqual(spendingByCategory(raw.transactions, period));
    expect(f.recurring).toEqual(recurring);
    expect(f.obligations).toEqual(
      upcomingObligations(recurring, raw.liabilities, { now: DEMO_NOW, horizonDays: 30 }),
    );
  });

  it("is deterministic across runs and personas", async () => {
    for (const persona of ["stable", "irregular", "wealthy"] as PersonaId[]) {
      const raw = await loadRaw(persona);
      expect(computeFinancials(raw, MONTH)).toEqual(computeFinancials(raw, MONTH));
    }
  });

  it("honours a caller-supplied transaction override (corrections path)", async () => {
    const raw = await loadRaw("stable");
    const empty = computeFinancials(raw, MONTH, { transactions: [] });
    expect(empty.cashflow.income).toBe(0);
    expect(empty.cashflow.expense).toBe(0);
    expect(empty.categorySpend).toEqual([]);
  });
});
