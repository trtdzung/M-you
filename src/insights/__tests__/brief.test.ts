import { describe, expect, it } from "vitest";
import { composeMonthlyBrief } from "../brief";
import { advisoryFor } from "../advisory-copy";
import { numbersIn, factValues } from "../narrate";
import { isCopilotIntent, resolveIntentRoute } from "@/lib/copilot-nav";
import type { CashflowResult } from "@/domain/engine";
import { makeCashflow, makeFinancials } from "./helpers";

/** A cashflow with no underlying data — its only honest tell is freshness null. */
function noDataCashflow(): CashflowResult {
  return makeCashflow({
    meta: {
      period: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.000Z", label: "06/2026" },
      sourceCoverage: { sources: [], knownCount: 0, unknownCount: 0 },
      freshness: null,
    },
  });
}

describe("composeMonthlyBrief — insufficient data", () => {
  it("returns an honest message and NO fabricated action", () => {
    const brief = composeMonthlyBrief(
      makeFinancials({ cashflow: noDataCashflow(), prevCashflow: noDataCashflow() }),
    );
    expect(brief.sufficientData).toBe(false);
    expect(brief.emptyMessage).toContain("Chưa đủ dữ liệu");
    expect(brief.actions).toHaveLength(0);
    expect(brief.highlights).toHaveLength(0);
    expect(brief.positives).toHaveLength(0);
    expect(brief.risks).toHaveLength(0);
  });
});

describe("composeMonthlyBrief — data suffices", () => {
  const spike = makeFinancials({
    cashflow: makeCashflow({ income: 10_000_000, byCategory: [{ categoryId: "shopping", amount: 3_000_000 }] }),
    prevCashflow: makeCashflow({ byCategory: [{ categoryId: "shopping", amount: 1_000_000 }] }),
  });

  it("builds a highlight with evidence, templated meaning and an actionable CTA", () => {
    const brief = composeMonthlyBrief(spike);
    expect(brief.sufficientData).toBe(true);
    expect(brief.emptyMessage).toBeNull();

    const h = brief.highlights.find((x) => x.insight.type === "spending_spike");
    expect(h).toBeDefined();
    expect(h!.insight.sourceFacts.length).toBeGreaterThan(0); // evidence present
    expect(h!.meaning.length).toBeGreaterThan(0); // nghĩa là gì
    expect(isCopilotIntent(h!.action.intentId)).toBe(true); // whitelisted deep-link
  });

  it("has ≥1 actionable 'nên làm gì' when data suffices", () => {
    const brief = composeMonthlyBrief(spike);
    expect(brief.actions.length).toBeGreaterThanOrEqual(1);
    for (const a of brief.actions) expect(isCopilotIntent(a.intentId)).toBe(true);
  });

  it("surfaces a positive for a net surplus", () => {
    const brief = composeMonthlyBrief(spike);
    const pos = brief.positives.find((p) => p.title === "Dòng tiền dương");
    expect(pos).toBeDefined();
    expect(pos!.detail).toContain("10.000.000"); // net from the engine (cashflow.net)
  });

  it("carries provenance on every finding and highlight", () => {
    const brief = composeMonthlyBrief(spike);
    for (const item of [...brief.positives, ...brief.risks]) {
      expect(item.source).toBe("mock");
      expect(item.freshness).not.toBeNull();
    }
    for (const h of brief.highlights) {
      expect(h.source).toBe("mock");
      expect(h.freshness).not.toBeNull();
    }
  });

  it("keeps every displayed number grounded in an engine fact", () => {
    const brief = composeMonthlyBrief(spike);
    const net = spike.cashflow.net;
    for (const p of brief.positives) {
      for (const n of numbersIn(p.detail)) {
        if (n >= 1900 && n <= 2100) continue;
        if (n >= 1000) expect(n).toBe(Math.abs(net));
      }
    }
    for (const h of brief.highlights) {
      const facts = factValues(h.insight);
      for (const n of numbersIn(h.insight.explanation)) {
        if (n >= 1900 && n <= 2100) continue;
        if (n >= 1000) expect(facts).toContain(n);
      }
    }
  });
});

describe("composeMonthlyBrief — data-rich but detector-quiet month", () => {
  it("still yields ≥1 grounded fallback action from net cash flow", () => {
    const surplus = makeFinancials({ cashflow: makeCashflow({ income: 10_000_000 }) });
    const brief = composeMonthlyBrief(surplus);
    expect(brief.highlights).toHaveLength(0);
    expect(brief.actions).toHaveLength(1);
    // Red-team #1: the surplus fallback points at the Hũ intent, which now
    // resolves to the Ngân sách tab (BIDV 4-tab IA, plan 260910-1626). Assert the
    // RESOLVED ROUTE, not the intent string, so the CTA can never dead-link.
    expect(resolveIntentRoute(brief.actions[0].intentId)).toBe("/pfm?tab=budget");
  });
});

describe("advisory CTAs resolve to live routes (red-team #1)", () => {
  it("routes the remapped upcoming_obligation / income_change CTAs to the Ngân sách tab, never a dead /pfm", () => {
    for (const type of ["upcoming_obligation", "income_change"] as const) {
      for (const band of ["low", "medium", "high"] as const) {
        const copy = advisoryFor(type, band);
        expect(copy).not.toBeNull();
        expect(resolveIntentRoute(copy!.intentId)).toBe("/pfm?tab=budget");
      }
    }
  });
});

describe("advisoryFor", () => {
  it("keys copy to detector type AND magnitude band", () => {
    const low = advisoryFor("spending_spike", "low");
    const high = advisoryFor("spending_spike", "high");
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect(low!.meaning).not.toBe(high!.meaning); // band changes the wording
  });

  it("returns null for an unknown detector type", () => {
    expect(advisoryFor("no_such_type", "low")).toBeNull();
  });
});
