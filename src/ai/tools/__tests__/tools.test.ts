import { describe, expect, it } from "vitest";
import { getProviders, PERSONAS, type PersonaId } from "@/providers";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { currentMonthKey } from "@/lib/demo-clock";
import type { AiContext } from "@/ai/server/load-financials";
import { TIER_A_TOOLS, getTool, toolSchemas } from "../registry";
import type { ToolOutcome } from "../types";

/** Build an AiContext without the server-only loader (test-safe). */
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
  return { personaId, monthKey, raw, financials: computeFinancials(raw, monthKey), scopes: ["transactions", "assets", "liabilities", "ai"] };
}

function unwrap(outcome: ToolOutcome) {
  if (!outcome.ok) throw new Error(`expected ok, got error: ${outcome.error}`);
  return outcome.result;
}

describe("Tier A tool registry", () => {
  it("exposes six tools with non-empty schemas and no duplicates", () => {
    expect(TIER_A_TOOLS).toHaveLength(6);
    const names = TIER_A_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(6);
    for (const schema of toolSchemas()) {
      expect(schema.description.length).toBeGreaterThan(0);
      expect(schema.inputSchema).toBeTruthy();
    }
  });

  it("every read tool returns numbers matching the engine, with sources", async () => {
    const ctx = await context();
    const cf = unwrap(getTool("getMonthlyCashflow")!.handler({}, ctx));
    expect(cf.data.income).toBe(ctx.financials.cashflow.income);
    expect(cf.data.expense).toBe(ctx.financials.cashflow.expense);
    expect(cf.sources.length).toBeGreaterThan(0);

    const nw = unwrap(getTool("calculateNetWorth")!.handler({}, ctx));
    expect(nw.data.net).toBe(ctx.financials.networth.total);
    expect(nw.sources.length).toBeGreaterThan(0);

    const cat = unwrap(getTool("getSpendingByCategory")!.handler({ topN: 2 }, ctx));
    expect((cat.data.categories as unknown[]).length).toBeLessThanOrEqual(2);

    const ob = unwrap(getTool("getUpcomingObligations")!.handler({}, ctx));
    expect(Array.isArray(ob.data.obligations)).toBe(true);
  });
});

describe("simulation tools", () => {
  it("simulateGoal resolves the persona goal and returns a series", async () => {
    const ctx = await context("stable");
    const goalId = PERSONAS.stable.goals[0].id;
    const res = unwrap(getTool("simulateGoal")!.handler({ goalId, monthlyContribution: 5_000_000 }, ctx));
    expect(res.data.status).toBe("achievable");
    expect((res.data.series as unknown[]).length).toBeGreaterThan(1);
  });

  it("simulateDebtRepayment resolves the persona liability and amortizes", async () => {
    const ctx = await context("stable");
    const liabilityId = PERSONAS.stable.liabilities[0].id;
    const res = unwrap(getTool("simulateDebtRepayment")!.handler({ liabilityId, monthlyPayment: 4_000_000 }, ctx));
    expect(["payable", "never"]).toContain(res.data.status);
    expect(res.sources.length).toBeGreaterThan(0);
  });

  it("returns a structured error (not a throw) for an unknown id", async () => {
    const ctx = await context("stable");
    const outcome = getTool("simulateGoal")!.handler({ goalId: "nope" }, ctx);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("Không tìm thấy");
  });

  it("asks which liability when the persona has several (ambiguous)", async () => {
    const ctx = await context("wealthy"); // wealthy has 3 liabilities
    const outcome = getTool("simulateDebtRepayment")!.handler({ monthlyPayment: 1_000_000 }, ctx);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("nhiều");
  });
});
