import { describe, expect, it } from "vitest";
import type { Account } from "@/domain/models";
import type { CashflowResult } from "../cashflow";
import type { NetWorthResult } from "../networth";
import { HEALTH_BANDS, financialHealth } from "../health";

function account(over: Partial<Account> = {}): Account {
  return {
    id: over.id ?? "acc",
    type: over.type ?? "current",
    institution: "MSB",
    currency: "VND",
    balance: 0,
    availableBalance: over.availableBalance ?? 0,
    lastSyncedAt: over.lastSyncedAt ?? "2026-09-15T00:00:00.000Z",
    source: "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
  };
}

function cashflow(over: Partial<CashflowResult> = {}): CashflowResult {
  return {
    income: over.income ?? 0,
    expense: over.expense ?? 0,
    net: over.net ?? 0,
    byCategory: [],
    fixed: over.fixed ?? 0,
    discretionary: over.discretionary ?? 0,
    pendingExpense: 0,
    meta: { period: { from: "", to: "", label: "" }, sourceCoverage: { sources: [], knownCount: 0, unknownCount: 0 }, freshness: over.meta?.freshness ?? "2026-09-14T00:00:00.000Z" },
  };
}

function networth(over: Partial<NetWorthResult> = {}): NetWorthResult {
  return {
    total: over.total ?? 0,
    assetsTotal: over.assetsTotal ?? 0,
    liabilitiesTotal: over.liabilitiesTotal ?? 0,
    breakdown: over.breakdown ?? [],
    unknownFields: over.unknownFields ?? [],
    hasUnknown: over.hasUnknown ?? false,
    meta: { period: { from: "", to: "", label: "Hiện tại" }, sourceCoverage: { sources: [], knownCount: 0, unknownCount: 0 }, freshness: over.meta?.freshness ?? "2026-09-15T00:00:00.000Z" },
  };
}

const ACCTS: Account[] = [
  account({ type: "current", availableBalance: 18_000_000 }),
  account({ type: "savings", availableBalance: 45_000_000 }),
];

describe("financialHealth", () => {
  it("computes all four indicators with estimated provenance", () => {
    const nw = networth({
      assetsTotal: 100_000_000,
      breakdown: [
        { id: "a1", label: "Nhà", type: "real_estate", amount: 60_000_000, kind: "asset", source: "self_reported" },
        { id: "a2", label: "Quỹ", type: "fund", amount: 40_000_000, kind: "asset", source: "self_reported" },
      ],
    });
    const h = financialHealth(cashflow({ income: 30_000_000, expense: 9_000_000, fixed: 12_000_000, net: 21_000_000 }), ACCTS, nw);

    expect(h.runwayMonths.value).toBeCloseTo(63_000_000 / 9_000_000, 5);
    expect(h.surplus.value).toBe(21_000_000);
    expect(h.essentialCoverage.value).toBeCloseTo(12_000_000 / 30_000_000, 5); // 0.4
    expect(h.concentration.value).toBeCloseTo(0.6, 5); // 60M / 100M
    for (const ind of [h.runwayMonths, h.surplus, h.essentialCoverage, h.concentration]) {
      expect(ind.source).toBe("estimated");
    }
  });

  it("assigns bands from the named thresholds", () => {
    const nw = networth({ assetsTotal: 100_000_000, breakdown: [{ id: "a", label: "x", type: "cash", amount: 30_000_000, kind: "asset", source: "msb" }] });
    const h = financialHealth(cashflow({ income: 30_000_000, expense: 9_000_000, fixed: 12_000_000, net: 21_000_000 }), ACCTS, nw);
    expect(h.runwayMonths.band).toBe("good"); // ~7 ≥ 6
    expect(h.surplus.band).toBe("good"); // positive
    expect(h.essentialCoverage.band).toBe("good"); // 0.4 ≤ 0.5
    expect(h.concentration.band).toBe("good"); // 0.3 ≤ 0.4
    expect(HEALTH_BANDS.runwayMonths.good).toBe(6);
  });

  it("[missing] essentialCoverage is null when income is 0", () => {
    const h = financialHealth(cashflow({ income: 0, fixed: 5_000_000 }), ACCTS, networth());
    expect(h.essentialCoverage.value).toBeNull();
    expect(h.essentialCoverage.band).toBeNull();
  });

  it("[missing] concentration is null when there are no valued assets", () => {
    const h = financialHealth(cashflow({ income: 10_000_000, expense: 5_000_000 }), ACCTS, networth({ assetsTotal: 0 }));
    expect(h.concentration.value).toBeNull();
  });

  it("[missing] runway is null when expense is 0", () => {
    const h = financialHealth(cashflow({ expense: 0 }), ACCTS, networth());
    expect(h.runwayMonths.value).toBeNull();
  });

  it("negative surplus bands as bad", () => {
    const h = financialHealth(cashflow({ income: 5_000_000, expense: 8_000_000, net: -3_000_000 }), ACCTS, networth());
    expect(h.surplus.band).toBe("bad");
  });

  it("[M4] concentration carries hasUnknown caveat when net worth has unvalued assets", () => {
    const nw = networth({
      assetsTotal: 50_000_000,
      breakdown: [{ id: "a", label: "Quỹ", type: "fund", amount: 50_000_000, kind: "asset", source: "self_reported" }],
      unknownFields: ["Căn hộ"],
      hasUnknown: true,
    });
    const h = financialHealth(cashflow({ income: 20_000_000, expense: 8_000_000 }), ACCTS, nw);
    expect(h.concentration.hasUnknown).toBe(true);
    expect(h.concentration.value).toBeCloseTo(1, 5); // 50M/50M of the *valued* portion
  });
});
