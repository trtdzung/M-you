import { describe, expect, it } from "vitest";
import type { Liability } from "@/domain/models";
import { simulateDebtRepayment } from "../debt";

const ASOF = new Date("2026-09-15T00:00:00.000Z");

function liability(overrides: Partial<Liability> = {}): Liability {
  return {
    id: "l1",
    type: "personal_loan",
    name: "Vay tiêu dùng",
    outstandingPrincipal: 40_000_000,
    interestRate: 0.12,
    minimumPayment: 3_500_000,
    dueDate: "2026-09-25",
    remainingTerm: 12,
    source: "self_reported",
    lastUpdatedAt: ASOF.toISOString(),
    ...overrides,
  };
}

describe("simulateDebtRepayment", () => {
  it("amortizes to a payoff month with positive total interest", () => {
    const p = simulateDebtRepayment(liability(), { monthlyPayment: 3_500_000, asOf: ASOF });
    expect(p.status).toBe("payable");
    expect(p.monthsToPayoff).toBeGreaterThan(0);
    expect(p.totalInterest).toBeGreaterThan(0);
    // Balance monotonically non-increasing and ends at 0.
    expect(p.series[0].balance).toBe(40_000_000);
    expect(p.series[p.series.length - 1].balance).toBe(0);
  });

  it("with zero interest, months = ceil(principal / payment)", () => {
    const p = simulateDebtRepayment(
      liability({ interestRate: 0, outstandingPrincipal: 9_000_000 }),
      { monthlyPayment: 1_500_000, asOf: ASOF },
    );
    expect(p.status).toBe("payable");
    expect(p.monthsToPayoff).toBe(6);
    expect(p.totalInterest).toBe(0);
  });

  it("flags never-amortizing when payment does not cover monthly interest", () => {
    // 40m @ 12%/yr → 400k interest/month; paying 300k never reduces balance.
    const p = simulateDebtRepayment(liability(), { monthlyPayment: 300_000, asOf: ASOF });
    expect(p.status).toBe("never");
    expect(p.monthsToPayoff).toBeNull();
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  it("stays unknown when principal/rate/payment is missing (never defaults to 0)", () => {
    expect(simulateDebtRepayment(liability({ outstandingPrincipal: null }), { monthlyPayment: 1_000_000, asOf: ASOF }).status).toBe("unknown");
    expect(simulateDebtRepayment(liability({ interestRate: null }), { monthlyPayment: 1_000_000, asOf: ASOF }).status).toBe("unknown");
    expect(simulateDebtRepayment(liability(), { asOf: ASOF }).status).toBe("unknown");
  });

  it("is deterministic", () => {
    const a = simulateDebtRepayment(liability(), { monthlyPayment: 5_000_000, asOf: ASOF });
    const b = simulateDebtRepayment(liability(), { monthlyPayment: 5_000_000, asOf: ASOF });
    expect(a).toEqual(b);
  });
});
