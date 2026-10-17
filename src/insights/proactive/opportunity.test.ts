import { describe, expect, it } from "vitest";
import type { Account, Goal, Liability } from "@/domain/models";
import type { Financials } from "@/domain/engine/finance-compose";
import { productOpportunityCandidate, type OpportunityInput } from "./opportunity";
import { semanticSignature } from "./cache";

const now = new Date("2026-09-15T00:00:00.000Z");
function input(): OpportunityInput {
  return {
    now,
    accounts: [{ id: "a", type: "current", currency: "VND", availableBalance: 70_000_000,
      lastSyncedAt: now.toISOString(), source: "msb" } as Account],
    liabilities: [{ id: "loan", type: "personal_loan", name: "Vay tiêu dùng", outstandingPrincipal: 5_000_000,
      minimumPayment: 500_000, interestRate: 0.08, dueDate: "2026-10-20", remainingTerm: 10,
      source: "self_reported", lastUpdatedAt: now.toISOString() } as Liability],
    goals: [{ id: "reserve", name: "Quỹ dự phòng", targetAmount: 30_000_000,
      currentAmount: 20_000_000, targetDate: "2027-06-30", source: "self_reported" } as Goal],
    fin: {
      monthKey: "2026-09",
      cashflow: { expense: 5_000_000 }, prevCashflow: { expense: 5_000_000 },
      jarBudget: { lines: [{ categoryIds: ["housing"], limitState: "set", limit: 8_000_000,
        spent: 3_000_000, balance: 5_000_000 }] },
    } as unknown as Financials,
  };
}

describe("product discovery after protected money", () => {
  it("offers both official products only after protecting jars, debt, goals and buffer", () => {
    const candidate = productOpportunityCandidate(input());
    expect(candidate).toMatchObject({ priorityClass: "P4", semanticState: "m_sinh_loi+msb_certificate" });
    expect(candidate?.metrics.safe_surplus).toBe(70_000_000 - 5_000_000 - 1_500_000 - 3_000_000 - 10_000_000);
  });

  it("withholds the certificate for a near goal and versions the product set", () => {
    const base = productOpportunityCandidate(input())!;
    const soon = input();
    soon.goals[0].targetDate = "2026-10-15";
    const next = productOpportunityCandidate(soon)!;
    expect(next.semanticState).toBe("m_sinh_loi");
    expect(semanticSignature("home-v1", next)).not.toBe(semanticSignature("home-v1", base));
  });

  it("blocks offers for high-cost debt, unknown obligation, unfunded jar or missing spend history", () => {
    const highRate = input(); highRate.liabilities[0].interestRate = 0.3;
    expect(productOpportunityCandidate(highRate)).toBeNull();
    const unknown = input(); unknown.liabilities[0].minimumPayment = null;
    expect(productOpportunityCandidate(unknown)).toBeNull();
    const jarRisk = input(); jarRisk.fin.jarBudget.lines[0].spent = 7_000_000;
    expect(productOpportunityCandidate(jarRisk)).toBeNull();
    const noHistory = input(); noHistory.fin.prevCashflow.expense = 0;
    expect(productOpportunityCandidate(noHistory)).toBeNull();
  });

  it("does not infer investable cash from CASA alone", () => {
    const thin = input(); thin.accounts[0].availableBalance = 20_000_000;
    expect(productOpportunityCandidate(thin)).toBeNull();
    const missingGoalDate = input(); missingGoalDate.goals[0].targetDate = null;
    expect(productOpportunityCandidate(missingGoalDate)?.metrics.product_ids).toBe("m_sinh_loi");
  });
});
