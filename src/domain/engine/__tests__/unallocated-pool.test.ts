import { describe, it, expect } from "vitest";
import type { Account } from "@/domain/models";
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
  it("positive pool: CASA − Σspendable", () => {
    const pool = computeUnallocatedPool({ casaBalance: 18_000_000, spendableTotal: 8_000_000 });
    expect(pool).toEqual({ amount: 10_000_000, overAllocated: false, source: "mock" });
  });

  it("exactly zero pool", () => {
    const pool = computeUnallocatedPool({ casaBalance: 8_000_000, spendableTotal: 8_000_000 });
    expect(pool.amount).toBe(0);
    expect(pool.overAllocated).toBe(false);
  });

  it("negative pool → overAllocated, keeps true negative (invariant #6, no clamp)", () => {
    const pool = computeUnallocatedPool({ casaBalance: 5_000_000, spendableTotal: 8_000_000 });
    expect(pool.amount).toBe(-3_000_000);
    expect(pool.overAllocated).toBe(true);
  });

  it("CASA dropped below Σspendable (after account-source debits) → overAllocated", () => {
    // Steady state pool ≥ 0, but an account-source transfer debits CASA to 6tr while
    // jars still claim 9tr of derived spendable → pool goes negative, badge stays live.
    const pool = computeUnallocatedPool({ casaBalance: 6_000_000, spendableTotal: 9_000_000 });
    expect(pool.amount).toBe(-3_000_000);
    expect(pool.overAllocated).toBe(true);
  });

  it("spendableTotal 0 (no jar claims anything) → whole CASA is unallocated", () => {
    expect(computeUnallocatedPool({ casaBalance: 18_000_000, spendableTotal: 0 }).amount).toBe(18_000_000);
  });
});
