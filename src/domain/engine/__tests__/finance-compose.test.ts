import { describe, expect, it } from "vitest";
import type { Asset, JarConfig, Liability } from "@/domain/models";
import { getProviders, type PersonaId } from "@/providers";
import { DEMO_NOW, prevMonthKey } from "@/lib/demo-clock";
import {
  aggregateCashflow,
  calculateNetWorth,
  detectRecurring,
  evaluateBudget,
  evaluateJarBudget,
  financialHealth,
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

  it("yields an empty jarBudget (no lines, no set limit) when no jarConfig is supplied", async () => {
    const raw = await loadRaw("stable");
    const f = computeFinancials(raw, MONTH);
    expect(f.jarBudget.lines).toEqual([]);
    expect(f.jarBudget.summary.totalLimit).toBeNull();
    expect(f.jarBudget.summary.totalSpent).toBe(0);
    expect(f.jarBudget.summary.setCount).toBe(0);
    expect(f.jarBudget.summary.unsetCount).toBe(0);
  });

  it("threads a supplied jarConfig through to jarBudget, matching evaluateJarBudget directly", async () => {
    const raw = await loadRaw("stable");
    const jarConfig: JarConfig = {
      version: 3,
      jars: [{ id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 5_000_000 }],
    };
    const f = computeFinancials(raw, MONTH, { jarConfig });

    const period = monthPeriodFromKey(MONTH);
    const prevPeriod = monthPeriodFromKey(prevMonthKey(MONTH));

    expect(f.jarBudget).toEqual(
      evaluateJarBudget(jarConfig, raw.transactions, period, prevPeriod, DEMO_NOW),
    );
    expect(f.jarBudget.lines).toHaveLength(1);
    expect(f.jarBudget.lines[0].huId).toBe("food");
    expect(f.jarBudget.lines[0].limit).toBe(5_000_000);
  });

  it("[red-team #3] merges user assets/liabilities into net worth without double-counting seed", async () => {
    const raw = await loadRaw("stable");
    const seed = computeFinancials(raw, MONTH);

    const userAsset: Asset = {
      id: "ua", type: "cash", name: "Ví", value: 6_000_000, currency: "VND",
      source: "self_reported", lastUpdatedAt: "2026-09-09T00:00:00.000Z", isEstimated: true,
    };
    const userLiability: Liability = {
      id: "ul", type: "credit_card", name: "Thẻ", outstandingPrincipal: 2_000_000,
      interestRate: 0.3, minimumPayment: 200_000, dueDate: null, remainingTerm: null,
      source: "self_reported", lastUpdatedAt: "2026-09-09T00:00:00.000Z",
    };

    const withUser = computeFinancials(raw, MONTH, {
      userAssets: [userAsset],
      userLiabilities: [userLiability],
    });

    // Each user record is counted EXACTLY once on top of the seed totals.
    expect(withUser.networth.assetsTotal).toBe(seed.networth.assetsTotal + 6_000_000);
    expect(withUser.networth.liabilitiesTotal).toBe(seed.networth.liabilitiesTotal + 2_000_000);
    expect(withUser.networth.breakdown.filter((i) => i.id === "ua")).toHaveLength(1);

    // The seed-only path is untouched (listAssets stays seed-only, red-team #3).
    expect(computeFinancials(raw, MONTH).networth).toEqual(seed.networth);
  });

  it("[red-team #6] keeps a user asset with unknown valuation unknown (never 0)", async () => {
    const raw = await loadRaw("stable");
    const seed = computeFinancials(raw, MONTH);
    const unvalued: Asset = {
      id: "ua_unknown", type: "real_estate", name: "Đất chưa định giá", value: null,
      currency: "VND", source: "self_reported", lastUpdatedAt: "2026-09-09T00:00:00.000Z", isEstimated: true,
    };
    const withUser = computeFinancials(raw, MONTH, { userAssets: [unvalued] });
    expect(withUser.networth.assetsTotal).toBe(seed.networth.assetsTotal); // not summed
    expect(withUser.networth.hasUnknown).toBe(true);
    expect(withUser.networth.unknownFields).toContain("Đất chưa định giá");
  });

  it("composes financial health from the same inputs (non-trivial: debt + assets)", async () => {
    // The "wealthy" persona carries multiple assets (incl. one unvalued property)
    // and three liabilities — a genuine wealth picture, not the empty default.
    const raw = await loadRaw("wealthy");
    const f = computeFinancials(raw, MONTH);

    // Composed once here — every indicator must trace to the SAME cashflow /
    // accounts / networth the rest of `Financials` exposes (DRY, no local recompute).
    expect(f.health).toEqual(financialHealth(f.cashflow, raw.accounts, f.networth));

    // All four indicators are populated (not the null default) for this persona.
    expect(f.health.runwayMonths.value).not.toBeNull();
    expect(typeof f.health.surplus.value).toBe("number");
    expect(f.health.essentialCoverage.value).not.toBeNull();
    expect(f.health.concentration.value).not.toBeNull();

    // Derived → provenance forced to "estimated" (invariant #5).
    for (const ind of [
      f.health.runwayMonths,
      f.health.surplus,
      f.health.essentialCoverage,
      f.health.concentration,
    ]) {
      expect(ind.source).toBe("estimated");
    }

    // Concentration must flag the unvalued property so its % isn't read as whole
    // (invariant #6 — unknown assets stay unknown, never counted as 0).
    expect(f.health.concentration.hasUnknown).toBe(true);
  });
});
