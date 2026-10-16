import { describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import { getProviders, type PersonaId } from "@/providers";
import { DEMO_NOW, prevMonthKey } from "@/lib/demo-clock";
import {
  aggregateCashflow,
  calculateNetWorth,
  detectRecurring,
  evaluateBudget,
  evaluateJarPartition,
  monthPeriodFromKey,
  resolvePrimaryAccount,
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

  it("[Red Team C2] computes a numeric end-of-month only for the current month", async () => {
    const raw = await loadRaw("stable");
    // DEMO_NOW is 2026-09 → the projection is valid.
    const current = computeFinancials(raw, "2026-09");
    expect(typeof current.endOfMonth.value).toBe("number");
    expect(current.endOfMonth.meta.source).toBe("estimated");
  });

  it("[Red Team C2] returns end-of-month 'unknown' for a browsed past month", async () => {
    const raw = await loadRaw("stable");
    const past = computeFinancials(raw, "2026-08");
    // A now-anchored projection over a different month is genuinely unknown,
    // never a misleading number (invariant #6).
    expect(past.endOfMonth.value).toBe("unknown");
    expect(past.endOfMonth.meta.source).toBe("estimated");
  });

  it("yields a full-balance residual partition when no jarConfig is supplied", async () => {
    const raw = await loadRaw("stable");
    const f = computeFinancials(raw, MONTH);
    const balance = resolvePrimaryAccount(raw.accounts)!.balance;
    expect(f.jarPartition.status).toBe("ok");
    expect(f.jarPartition.lines).toHaveLength(1); // residual only
    expect(f.jarPartition.lines[0].isResidual).toBe(true);
    expect(f.jarPartition.total).toBe(balance);
  });

  it("threads a supplied jarConfig through to jarPartition, reconciling to balance", async () => {
    const raw = await loadRaw("stable");
    const jarConfig: JarConfig = {
      version: 2,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "amount", value: 5_000_000 } },
      ],
    };
    const f = computeFinancials(raw, MONTH, { jarConfig });

    const period = monthPeriodFromKey(MONTH);
    const prevPeriod = monthPeriodFromKey(prevMonthKey(MONTH));
    const primary = resolvePrimaryAccount(raw.accounts);

    expect(f.jarPartition).toEqual(
      evaluateJarPartition(jarConfig, primary, raw.transactions, period, prevPeriod),
    );
    expect(f.jarPartition.total).toBe(primary!.balance); // Σ ≡ số dư
    expect(f.jarPartition.lines.length).toBeGreaterThan(1); // explicit jar + residual
  });
});
