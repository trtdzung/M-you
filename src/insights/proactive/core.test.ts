import { describe, expect, it } from "vitest";
import type { JarBudgetResult } from "@/domain/engine/jar-budget";
import { jarPlanCandidates, knownPaymentCandidates, resolvePriority, spendingPressureCandidates, type ProactiveCandidate } from "./core";
import type { Financials } from "@/domain/engine/finance-compose";
import { decideCache, featureFingerprint, semanticSignature } from "./cache";

const now = new Date("2026-09-15T00:00:00.000Z");

function budget(overrides: Partial<JarBudgetResult["lines"][number]> = {}): JarBudgetResult {
  return {
    lines: [{ huId: "food", label: "Ăn uống", categoryIds: ["dining"], spent: 800_000,
      prevSpent: 0, momDelta: 800_000, momPct: null, limit: 1_000_000, limitState: "set",
      rebalanceNet: 0, balance: 200_000, pct: 0.8, status: "near", thresholdHit: true,
      source: "mock", freshness: "2026-09-14T00:00:00.000Z", ...overrides }],
    summary: { totalLimit: 1_000_000, totalSpent: 800_000, totalSpentSet: 800_000,
      totalRebalanceNet: 0, totalBalance: 200_000, pctUsed: 0.8, daysLeft: 15,
      setCount: 1, unsetCount: 0 },
    meta: { period: { from: "2026-08-31T17:00:00.000Z", to: "2026-09-30T16:59:59.999Z", label: "09/2026" },
      sourceCoverage: { sources: ["mock"], knownCount: 1, unknownCount: 0 }, freshness: "2026-09-14T00:00:00.000Z" },
  };
}

describe("jar plan signals", () => {
  it("fires at exactly 80%, keeps raw balance and uses the current VN month", () => {
    const [c] = jarPlanCandidates("2026-09", budget(), now);
    expect(c.semanticState).toBe("near_limit");
    expect(c.metrics.remaining).toBe(200_000);
    expect(jarPlanCandidates("2026-08", budget(), now)).toEqual([]);
  });

  it("separates over-limit covered from a negative balance that needs cover", () => {
    const covered = jarPlanCandidates("2026-09", budget({ spent: 1_100_000, balance: 100_000, rebalanceNet: 200_000 }), now)[0];
    const short = jarPlanCandidates("2026-09", budget({ spent: 1_100_000, balance: -100_000 }), now)[0];
    expect(covered.semanticState).toBe("over_limit_covered");
    expect(short.semanticState).toBe("needs_cover");
    expect(short.severity).toBe("urgent");
  });

  it("skips unset, below threshold, and invalid values", () => {
    expect(jarPlanCandidates("2026-09", budget({ limit: null, limitState: "unset", balance: null }), now)).toEqual([]);
    expect(jarPlanCandidates("2026-09", budget({ spent: 799_999, balance: 200_001 }), now)).toEqual([]);
    expect(jarPlanCandidates("2026-09", budget({ spent: Number.POSITIVE_INFINITY }), now)).toEqual([]);
    expect(jarPlanCandidates("2026-09", budget({ limit: 0, spent: 0, balance: 0 }), now)).toEqual([]);
  });
});

describe("priority and cache", () => {
  const base = jarPlanCandidates("2026-09", budget(), now)[0];
  const candidate = (priorityClass: ProactiveCandidate["priorityClass"], id: string): ProactiveCandidate =>
    ({ ...base, id, priorityClass });

  it("suppresses P4/P5 while P0 or P1 is active before selecting", () => {
    expect(resolvePriority([candidate("P5", "good"), candidate("P4", "surplus"), candidate("P1", "risk")], 5)
      .map((c) => c.id)).toEqual(["risk"]);
    expect(resolvePriority([candidate("P4", "surplus"), candidate("P2", "spend")], 5)
      .map((c) => c.id)).toEqual(["spend", "surplus"]);
  });

  it("uses exact fingerprint then semantic copy reuse, and versions material changes", () => {
    const exact = featureFingerprint("cif-1", "v1", base);
    const semantic = semanticSignature("v1", base);
    expect(featureFingerprint("cif-1", "v1", { ...base, metrics: { ...base.metrics } })).toBe(exact);
    expect(featureFingerprint("cif-2", "v1", base)).not.toBe(exact);
    expect(decideCache({ fingerprint: exact, semanticSignature: semantic, reusableCopy: true },
      { fingerprint: exact, semanticSignature: semantic })).toBe("exact_reuse");
    const changed = { ...base, metrics: { ...base.metrics, spent: 810_000 } };
    expect(decideCache({ fingerprint: exact, semanticSignature: semantic, reusableCopy: true },
      { fingerprint: featureFingerprint("cif-1", "v1", changed), semanticSignature: semanticSignature("v1", changed) })).toBe("copy_reuse");
    const material = { ...changed, semanticState: "needs_cover", severity: "urgent" as const };
    expect(decideCache({ fingerprint: exact, semanticSignature: semantic, reusableCopy: true },
      { fingerprint: featureFingerprint("cif-1", "v1", material), semanticSignature: semanticSignature("v1", material) })).toBe("new_version");
    const renamed = { ...changed, metrics: { ...changed.metrics, jar_label: "Thực phẩm" } };
    expect(semanticSignature("v1", renamed)).not.toBe(semantic);
    expect(decideCache({ fingerprint: exact, semanticSignature: semantic, reusableCopy: false },
      { fingerprint: featureFingerprint("cif-1", "v1", changed), semanticSignature: semantic })).toBe("new_version");
  });
});

describe("known minimum payment reminder", () => {
  const liability = (id: string, dueDate: string | null, minimumPayment: number | null) => ({
    id, type: "credit_card" as const, name: "Thẻ tín dụng", outstandingPrincipal: 1_000_000,
    interestRate: null, minimumPayment, dueDate, remainingTerm: null, source: "mock" as const,
    lastUpdatedAt: "2026-09-14T00:00:00.000Z",
  });
  it("accepts a known liability only, without claiming liquidity shortfall", () => {
    const items = knownPaymentCandidates([
      liability("card", "2026-09-20", 500_000),
      liability("unknown", "2026-09-20", null),
    ], now);
    expect(items).toHaveLength(1);
    expect(items[0].insightType).toBe("known_payment_due_reminder");
    expect(items[0].priorityClass).toBe("P0");
    expect(items[0].severity).toBe("urgent");
    expect(items[0].metrics.minimum_payment).toBe(500_000);
  });
  it("ignores overdue, invalid and more-than-thirty-day obligations", () => {
    expect(knownPaymentCandidates([
      liability("old", "2026-09-14", 100_000),
      liability("bad", "2026-02-30", 100_000),
      liability("far", "2026-11-01", 100_000),
    ], now)).toEqual([]);
  });
  it("keeps date-only liability active throughout its VN due date", () => {
    const lateDueDay = new Date("2026-09-20T16:30:00.000Z"); // 23:30 in VN
    expect(knownPaymentCandidates([liability("card", "2026-09-20", 100_000)], lateDueDay)[0]
      .metrics.days_until_due).toBe(0);
  });
});

describe("category spending pressure", () => {
  function financials(current: number, previous: number): Financials {
    return {
      monthKey: "2026-09",
      cashflow: { byCategory: [{ categoryId: "dining", amount: current }],
        meta: { sourceCoverage: { sources: ["mock"] }, freshness: "2026-09-14T00:00:00.000Z" } },
      prevCashflow: { byCategory: [{ categoryId: "dining", amount: previous }] },
      categoryLabels: new Map([["dining", "Ăn uống"]]),
    } as unknown as Financials;
  }
  it("requires both a greater-than-thirty-percent rise and a half-million increase", () => {
    expect(spendingPressureCandidates(financials(1_300_000, 1_000_000))).toEqual([]);
    expect(spendingPressureCandidates(financials(650_000, 100_000))).toHaveLength(1);
    expect(spendingPressureCandidates(financials(1_600_000, 1_000_000))[0].metrics.increase).toBe(600_000);
    expect(spendingPressureCandidates(financials(600_000, 0))).toEqual([]);
  });
});
