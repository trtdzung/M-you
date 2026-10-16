import { describe, it, expect } from "vitest";
import type { Account, Jar } from "@/domain/models";
import { casaBalance } from "../casa-balance";
import { computeUnallocatedPool } from "../unallocated-pool";

const IN = "2026-09-10T00:00:00.000Z";

function account(id: string, availableBalance: number, over: Partial<Account> = {}): Account {
  return {
    id,
    type: "current",
    institution: "MSB",
    currency: "VND",
    balance: availableBalance,
    availableBalance,
    lastSyncedAt: IN,
    source: "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
    ...over,
  };
}

function jar(id: string, actualAmount?: number): Jar {
  return { id, label: id, categoryIds: [], ...(actualAmount !== undefined ? { actualAmount } : {}) };
}

describe("casaBalance", () => {
  it("sums availableBalance of current accounts only", () => {
    const accounts = [
      account("cur", 18_000_000),
      account("sav", 45_000_000, { type: "savings" }),
      account("cc", 50_000_000, { type: "credit_card" }),
    ];
    expect(casaBalance(accounts)).toBe(18_000_000);
  });

  it("sums across MULTIPLE current accounts (RT#9 — not accounts[0])", () => {
    const accounts = [account("cur1", 18_000_000), account("cur2", 7_000_000)];
    expect(casaBalance(accounts)).toBe(25_000_000);
  });

  it("no current account → 0 denominator", () => {
    expect(casaBalance([account("sav", 45_000_000, { type: "savings" })])).toBe(0);
    expect(casaBalance([])).toBe(0);
  });

  it("uses availableBalance, not balance", () => {
    // credit-style row would never be current, but prove the field used is availableBalance.
    expect(casaBalance([account("cur", 10_000_000, { balance: 999, availableBalance: 10_000_000 })])).toBe(10_000_000);
  });
});

describe("computeUnallocatedPool", () => {
  it("positive pool: CASA − Σactual", () => {
    const pool = computeUnallocatedPool({
      casaBalance: 18_000_000,
      jars: [jar("a", 5_000_000), jar("b", 3_000_000)],
    });
    expect(pool).toEqual({ amount: 10_000_000, overAllocated: false, source: "mock" });
  });

  it("exactly zero pool", () => {
    const pool = computeUnallocatedPool({ casaBalance: 8_000_000, jars: [jar("a", 8_000_000)] });
    expect(pool.amount).toBe(0);
    expect(pool.overAllocated).toBe(false);
  });

  it("negative pool → overAllocated, keeps true negative (invariant #6, no clamp)", () => {
    const pool = computeUnallocatedPool({ casaBalance: 5_000_000, jars: [jar("a", 8_000_000)] });
    expect(pool.amount).toBe(-3_000_000);
    expect(pool.overAllocated).toBe(true);
  });

  it("jar without actualAmount contributes 0 (not fabricated)", () => {
    const pool = computeUnallocatedPool({
      casaBalance: 10_000_000,
      jars: [jar("funded", 4_000_000), jar("unfunded")],
    });
    expect(pool.amount).toBe(6_000_000);
  });

  it("many jars sum correctly", () => {
    const pool = computeUnallocatedPool({
      casaBalance: 20_000_000,
      jars: [jar("a", 2_000_000), jar("b", 3_000_000), jar("c", 1_500_000), jar("d")],
    });
    expect(pool.amount).toBe(13_500_000);
  });

  it("empty jars → whole CASA is unallocated", () => {
    expect(computeUnallocatedPool({ casaBalance: 18_000_000, jars: [] }).amount).toBe(18_000_000);
  });
});
