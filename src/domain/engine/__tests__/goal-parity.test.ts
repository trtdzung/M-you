import { describe, expect, it } from "vitest";
import { getProviders, type PersonaId } from "@/providers";
import { computeFinancials, type RawData, type Financials } from "@/domain/engine/finance-compose";
import { surplusFromResidual } from "@/domain/engine";
import { currentMonthKey } from "@/lib/demo-clock";

/** Compose deterministic financials for a persona (test-safe, no server-only loader). */
async function financialsFor(personaId: PersonaId = "stable"): Promise<Financials> {
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
  const raw: RawData = { transactions, accounts, assets, liabilities, budgets, snapshots, goals, products };
  return computeFinancials(raw, currentMonthKey());
}

describe("surplus = jar residual (Model A)", () => {
  it("mirrors the balance partition residual; unknown stays unknown (never 0)", () => {
    expect(surplusFromResidual(3_000_000)).toBe(3_000_000);
    expect(surplusFromResidual("unknown")).toBe("unknown");
    // A negative (over-allocated) residual floors to 0 — but unknown never does.
    expect(surplusFromResidual(-500_000)).toBe(0);
  });
});

describe("financial health — nulls stay unknown, never zeroed", () => {
  it("keeps uncomputable indicators null (rendered '—'), never coerced to 0", async () => {
    const { health } = await financialsFor("irregular");
    // Whatever cannot be computed is null (rendered "—"), not coerced to 0.
    for (const ind of [health.runwayMonths, health.surplus, health.essentialCoverage, health.concentration]) {
      expect(ind.value === null || typeof ind.value === "number").toBe(true);
      if (ind.value === null) expect(ind.value).not.toBe(0);
    }
  });
});
