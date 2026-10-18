import { describe, expect, it } from "vitest";
import { keepDeadlinePlan, extendDeadlinePlan, reduceAmountPlan, type PlanBase } from "../plans";
import type { AdvisorContext } from "../types";
const base: PlanBase = { draft: { name: "Du lịch", targetAmount: 10_000_000, targetDate: "2027-07-15", flexibility: "flexible", openingAmount: 0 }, now: new Date("2026-09-15"), months: 10, surplus: 800_000, ctx: { cuttable: [{ categoryId: "shopping", label: "Mua sắm", average: 1_000_000 }], signals: [], balances: { savings: null, current: null, creditCardDebt: null }, jars: [] } as unknown as AdvisorContext };
describe("three numeric goal levers", () => {
  it("offers one named spending cut that exactly closes the monthly gap", () => {
    const plan = keepDeadlinePlan(base);
    expect(plan.cuts).toEqual([{ categoryId: "shopping", label: "Mua sắm", perMonth: 200_000, reason: "category" }]);
    expect(plan.monthly).toBe(1_000_000);
    expect(plan.cutsCoverGap).toBe(true);
    expect(plan.fundingFromIdle).toBe(0);
  });
  it("caps the cut at 30% of observed spending and reports an uncovered gap", () => {
    const plan = keepDeadlinePlan({ ...base, ctx: { ...base.ctx, cuttable: [{ categoryId: "shopping", label: "Mua sắm", average: 100_000 }] } });
    expect(plan.cuts[0].perMonth).toBe(30_000);
    expect(plan.cutsCoverGap).toBe(false);
  });
  it("includes an existing cashflow deficit in the amount that needs cutting", () => {
    const plan = keepDeadlinePlan({ ...base, surplus: -100_000 });
    expect(plan.cuts[0].perMonth).toBe(300_000);
    expect(plan.cutsCoverGap).toBe(false);
  });
  it("does not invent spending groups or unknown cashflow", () => {
    expect(keepDeadlinePlan({ ...base, ctx: { ...base.ctx, cuttable: [] } }).cuts).toEqual([]);
    expect(keepDeadlinePlan({ ...base, surplus: "unknown" })).toMatchObject({ available: false, reason: "unknown_surplus" });
  });
  it("gives numeric date and amount alternatives and respects fixed deadlines", () => {
    expect(extendDeadlinePlan(base).months).toBeGreaterThan(10);
    expect(reduceAmountPlan(base).targetAmount).toBeLessThan(10_000_000);
    expect(extendDeadlinePlan({ ...base, draft: { ...base.draft, flexibility: "fixed" } }).available).toBe(false);
  });
});
