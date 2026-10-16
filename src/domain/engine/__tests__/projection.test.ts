import { describe, expect, it } from "vitest";
import type { Account } from "@/domain/models";
import type { CashflowResult } from "../cashflow";
import type { Obligation } from "../obligations";
import { networthTrend } from "../networth";
import { cashRunwayMonths, estimateEndOfMonth, liquidBalance } from "../projection";
import type { MonthlySnapshot } from "@/domain/models";

const NOW = new Date("2026-09-15T00:00:00.000Z"); // day 15 of a 30-day month

function account(over: Partial<Account> = {}): Account {
  return {
    id: over.id ?? "acc",
    type: over.type ?? "current",
    institution: "MSB",
    currency: "VND",
    balance: over.balance ?? 0,
    availableBalance: over.availableBalance ?? 0,
    lastSyncedAt: over.lastSyncedAt ?? "2026-09-15T00:00:00.000Z",
    source: over.source ?? "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
  };
}

function cashflow(over: Partial<CashflowResult> = {}): CashflowResult {
  return {
    income: over.income ?? 0,
    expense: over.expense ?? 0,
    net: over.net ?? (over.income ?? 0) - (over.expense ?? 0),
    byCategory: [],
    fixed: over.fixed ?? 0,
    discretionary: over.discretionary ?? 0,
    pendingExpense: 0,
    meta: {
      period: { from: "", to: "", label: "" },
      sourceCoverage: { sources: [], knownCount: 0, unknownCount: 0 },
      freshness: over.meta?.freshness ?? "2026-09-14T00:00:00.000Z",
    },
  };
}

function obligation(dueDate: string, amount: Obligation["amount"]): Obligation {
  return { id: `o_${dueDate}`, label: "Nợ", amount, dueDate, kind: "liability", source: "msb" };
}

const LIQUID_ACCTS: Account[] = [
  account({ id: "cur", type: "current", availableBalance: 18_000_000 }),
  account({ id: "sav", type: "savings", availableBalance: 45_000_000 }),
  account({ id: "cc", type: "credit_card", availableBalance: 50_000_000 }), // excluded from liquid
];

describe("liquidBalance", () => {
  it("sums only current + savings available balances (excludes credit card)", () => {
    expect(liquidBalance(LIQUID_ACCTS)).toBe(63_000_000);
  });
  it("is 0 for no accounts", () => {
    expect(liquidBalance([])).toBe(0);
  });
});

describe("estimateEndOfMonth", () => {
  it("applies the full run-rate formula and forces estimated provenance", () => {
    // liquid 63M; oblig 5M due day 20; discretionary 3M over 15 days → run-rate
    // 200k/day × 15 remaining = 3M. (Income was removed — no inflow term.)
    const r = estimateEndOfMonth(
      LIQUID_ACCTS,
      cashflow({ discretionary: 3_000_000, expense: 6_000_000 }),
      [obligation("2026-09-20T10:00:00.000Z", 5_000_000)],
      NOW,
    );
    expect(r.value).toBe(63_000_000 - 5_000_000 - 3_000_000);
    expect(r.meta.source).toBe("estimated");
    expect(r.meta.freshness).toBe("2026-09-14T00:00:00.000Z"); // oldest input
  });

  it("[C1] returns 'unknown' when an in-window obligation amount is unknown", () => {
    const r = estimateEndOfMonth(
      LIQUID_ACCTS,
      cashflow({ discretionary: 1_000_000 }),
      [obligation("2026-09-20T10:00:00.000Z", "unknown")],
      NOW,
    );
    expect(r.value).toBe("unknown");
    expect(r.meta.source).toBe("estimated");
  });

  it("excludes obligations due after month end", () => {
    const inMonth = estimateEndOfMonth(LIQUID_ACCTS, cashflow(), [obligation("2026-09-28T10:00:00.000Z", 4_000_000)], NOW);
    const nextMonth = estimateEndOfMonth(LIQUID_ACCTS, cashflow(), [obligation("2026-10-02T10:00:00.000Z", 4_000_000)], NOW);
    expect((nextMonth.value as number) - (inMonth.value as number)).toBe(4_000_000);
  });

  it("scales the discretionary run-rate: later in the month projects less remaining spend", () => {
    const cf = cashflow({ discretionary: 3_000_000 });
    const earlyNow = new Date("2026-09-05T00:00:00.000Z"); // 5 elapsed, 25 remaining
    const lateNow = new Date("2026-09-25T00:00:00.000Z"); // 25 elapsed, 5 remaining
    const early = estimateEndOfMonth(LIQUID_ACCTS, cf, [], earlyNow);
    const late = estimateEndOfMonth(LIQUID_ACCTS, cf, [], lateNow);
    // less spend projected late → higher end-of-month cash.
    expect(late.value as number).toBeGreaterThan(early.value as number);
  });
});

describe("cashRunwayMonths", () => {
  it("divides liquid cash by burn rate", () => {
    const r = cashRunwayMonths(LIQUID_ACCTS, 9_000_000);
    expect(r.months).toBeCloseTo(63_000_000 / 9_000_000, 5);
    expect(r.meta.source).toBe("estimated");
  });
  it("returns null (never 0/∞) when burn rate is 0", () => {
    expect(cashRunwayMonths(LIQUID_ACCTS, 0).months).toBeNull();
  });
  it("returns 0 months for empty accounts with positive burn", () => {
    expect(cashRunwayMonths([], 5_000_000).months).toBe(0);
  });
});

describe("networthTrend", () => {
  function snap(month: string, netWorth: number, source: MonthlySnapshot["source"] = "self_reported"): MonthlySnapshot {
    return { month, assetsTotal: netWorth, liabilitiesTotal: 0, netWorth, source };
  }

  it("exposes current/previous + chronological series (no delta object — C3)", () => {
    const t = networthTrend([snap("2026-07", 100), snap("2026-08", 110), snap("2026-09", 130)]);
    expect(t.current).toBe(130);
    expect(t.previous).toBe(110);
    expect(t.series).toEqual([100, 110, 130]);
  });

  it("sorts unordered snapshots by month before deriving", () => {
    const t = networthTrend([snap("2026-09", 130), snap("2026-07", 100), snap("2026-08", 110)]);
    expect(t.current).toBe(130);
    expect(t.previous).toBe(110);
    expect(t.series).toEqual([100, 110, 130]);
  });

  it("single snapshot → no previous (delta suppressed downstream)", () => {
    const t = networthTrend([snap("2026-09", 130)]);
    expect(t.current).toBe(130);
    expect(t.previous).toBeNull();
    expect(t.series).toEqual([130]);
  });

  it("no snapshots → nulls and empty series", () => {
    const t = networthTrend([]);
    expect(t.current).toBeNull();
    expect(t.previous).toBeNull();
    expect(t.series).toEqual([]);
    expect(t.meta.source).toBeNull();
  });

  it("[H2] reports the lowest-trust source across the series snapshots", () => {
    const t = networthTrend([snap("2026-07", 100, "estimated"), snap("2026-08", 110, "msb"), snap("2026-09", 130, "self_reported")]);
    expect(t.meta.source).toBe("estimated");
    expect(t.meta.count).toBe(3);
  });

  it("exposes freshness as a full ISO timestamp (start of latest snapshot month)", () => {
    const t = networthTrend([snap("2026-08", 110), snap("2026-09", 130)]);
    expect(t.meta.freshness).toBe("2026-09-01T00:00:00.000Z");
  });

  it("caps the series to the last N snapshots", () => {
    const many = Array.from({ length: 9 }, (_, i) => snap(`2026-0${i + 1}`.slice(0, 7), i * 10));
    const t = networthTrend(many, 6);
    expect(t.series).toHaveLength(6);
    expect(t.current).toBe(80); // last of 0..80
  });
});
