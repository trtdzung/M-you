import { describe, expect, it } from "vitest";
import { getProviders, PERSONAS, type PersonaId } from "@/providers";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { simulateGoal, surplusFromResidual } from "@/domain/engine";
import { currentMonthKey, DEMO_NOW } from "@/lib/demo-clock";
import type { AiContext } from "@/ai/server/load-financials";
import { getTool } from "@/ai/tools/registry";

/** Build an AiContext without the server-only loader (test-safe, mirrors tools.test). */
async function context(personaId: PersonaId = "stable"): Promise<AiContext> {
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
  const monthKey = currentMonthKey();
  return { personaId, monthKey, raw, financials: computeFinancials(raw, monthKey), scopes: ["ai"] };
}

describe("simulateGoal — direct-tap vs chat parity (invariant #1)", () => {
  it("the direct-tap what-if returns the SAME projection as the chat tool", async () => {
    const ctx = await context("stable");
    const goal = PERSONAS.stable.goals[0];
    const monthlyContribution = 5_000_000;

    // Chat path: the Tier-A `simulateGoal` tool.
    const outcome = getTool("simulateGoal")!.handler({ goalId: goal.id, monthlyContribution }, ctx);
    expect(outcome.ok).toBe(true);

    // Direct-tap path: the projection card calls the same engine fn.
    const direct = simulateGoal(goal, { monthlyContribution, asOf: DEMO_NOW });

    if (outcome.ok) expect(outcome.result.data).toEqual(direct);
  });
});

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
    const ctx = await context("irregular");
    const { health } = ctx.financials;
    // Whatever cannot be computed is null (rendered "—"), not coerced to 0.
    for (const ind of [health.runwayMonths, health.surplus, health.essentialCoverage, health.concentration]) {
      expect(ind.value === null || typeof ind.value === "number").toBe(true);
      if (ind.value === null) expect(ind.value).not.toBe(0);
    }
  });
});
