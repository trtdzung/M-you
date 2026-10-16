import { describe, expect, it } from "vitest";
import { aggregateCashflow } from "../cashflow";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5); // 06/2026

describe("aggregateCashflow", () => {
  it("sums expense from posted transactions", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "expense", categoryId: "dining", amount: 200_000 }),
        txn({ type: "expense", categoryId: "housing", amount: 6_000_000 }),
      ],
      JUNE,
    );
    expect(result.expense).toBe(6_200_000);
  });

  it("sums money-in from posted income and reports net (income − expense)", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "income", direction: "credit", categoryId: "unclassified", amount: 25_000_000 }),
        txn({ type: "income", direction: "credit", categoryId: "unclassified", amount: 3_000_000 }),
        txn({ type: "expense", categoryId: "dining", amount: 2_000_000 }),
      ],
      JUNE,
    );
    expect(result.income).toBe(28_000_000);
    expect(result.expense).toBe(2_000_000);
    expect(result.net).toBe(26_000_000);
  });

  it("keeps income out of the category breakdown", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "income", direction: "credit", categoryId: "unclassified", amount: 25_000_000 }),
        txn({ type: "expense", categoryId: "dining", amount: 200_000 }),
      ],
      JUNE,
    );
    expect(result.byCategory).toEqual([{ categoryId: "dining", amount: 200_000 }]);
  });

  it("excludes internal transfers and card payments from expense", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "transfer", categoryId: "transfer", amount: 2_000_000, transferGroupId: "g1" }),
        txn({ type: "transfer", direction: "credit", categoryId: "transfer", amount: 2_000_000, transferGroupId: "g1" }),
        txn({ type: "card_payment", categoryId: "transfer", amount: 1_500_000 }),
        txn({ type: "expense", categoryId: "dining", amount: 300_000 }),
      ],
      JUNE,
    );
    expect(result.expense).toBe(300_000);
  });

  it("applies refunds as a reversal of the matching category", () => {
    const result = aggregateCashflow(
      [
        txn({ id: "buy", type: "expense", categoryId: "shopping", amount: 1_000_000 }),
        txn({ id: "ref", type: "refund", direction: "credit", categoryId: "shopping", amount: 400_000, relatedTransactionId: "buy" }),
      ],
      JUNE,
    );
    expect(result.expense).toBe(600_000);
    expect(result.byCategory).toEqual([{ categoryId: "shopping", amount: 600_000 }]);
  });

  it("excludes reversed transactions from totals", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "expense", categoryId: "dining", amount: 500_000, status: "reversed" }),
        txn({ type: "expense", categoryId: "dining", amount: 200_000 }),
      ],
      JUNE,
    );
    expect(result.expense).toBe(200_000);
  });

  it("keeps pending separate from posted totals", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "expense", categoryId: "dining", amount: 200_000 }),
        txn({ type: "expense", categoryId: "shopping", amount: 800_000, status: "pending" }),
      ],
      JUNE,
    );
    expect(result.expense).toBe(200_000);
    expect(result.pendingExpense).toBe(800_000);
  });

  it("splits fixed vs discretionary by category flag", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "expense", categoryId: "housing", amount: 6_000_000 }), // fixed
        txn({ type: "expense", categoryId: "utilities", amount: 900_000 }), // fixed
        txn({ type: "expense", categoryId: "dining", amount: 1_100_000 }), // discretionary
      ],
      JUNE,
    );
    expect(result.fixed).toBe(6_900_000);
    expect(result.discretionary).toBe(1_100_000);
  });

  it("ignores transactions outside the period", () => {
    const result = aggregateCashflow(
      [
        txn({ type: "expense", categoryId: "dining", amount: 200_000, postedAt: "2026-05-31T10:00:00.000Z" }),
        txn({ type: "expense", categoryId: "dining", amount: 300_000, postedAt: "2026-06-15T10:00:00.000Z" }),
      ],
      JUNE,
    );
    expect(result.expense).toBe(300_000);
  });

  it("reports period, source coverage and freshness", () => {
    const result = aggregateCashflow(
      [txn({ type: "expense", amount: 100_000, source: "msb", postedAt: "2026-06-20T10:00:00.000Z" })],
      JUNE,
    );
    expect(result.meta.period.label).toBe("06/2026");
    expect(result.meta.sourceCoverage.sources).toContain("msb");
    expect(result.meta.freshness).toBe("2026-06-20T10:00:00.000Z");
  });
});
