import { describe, expect, it } from "vitest";
import { incomeByCategory, spendingByCategory } from "../category";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5);

/**
 * incomeByCategory mirrors spendingByCategory for the Báo cáo thu chi "Thu nhập"
 * toggle: only posted income counts; transfers, refunds, expenses, pending and
 * out-of-period rows are excluded (matching aggregateCashflow), sorted desc.
 */
describe("incomeByCategory", () => {
  const rows = [
    txn({ type: "income", categoryId: "salary", amount: 24_000_000, direction: "credit" }),
    txn({ type: "income", categoryId: "other_income", amount: 3_000_000, direction: "credit" }),
    txn({ type: "expense", categoryId: "dining", amount: 2_000_000 }),
    txn({ type: "transfer", categoryId: "salary", amount: 9_000_000, direction: "credit" }),
    txn({ type: "income", categoryId: "salary", amount: 5_000_000, direction: "credit", status: "pending" }),
    txn({ type: "income", categoryId: "salary", amount: 1_000_000, direction: "credit", postedAt: "2026-05-10T00:00:00.000Z" }),
  ];

  it("sums only posted income in the period, largest first", () => {
    const result = incomeByCategory(rows, JUNE);
    expect(result.map((r) => r.categoryId)).toEqual(["salary", "other_income"]);
    expect(result[0]).toMatchObject({ label: "Lương", amount: 24_000_000 });
    expect(result[1]).toMatchObject({ label: "Thu nhập khác", amount: 3_000_000 });
  });

  it("computes share against the income total", () => {
    const [salary, other] = incomeByCategory(rows, JUNE);
    expect(salary.share).toBeCloseTo(24 / 27, 5);
    expect(other.share).toBeCloseTo(3 / 27, 5);
  });

  it("excludes expenses (they belong to spendingByCategory)", () => {
    expect(incomeByCategory(rows, JUNE).some((r) => r.categoryId === "dining")).toBe(false);
    expect(spendingByCategory(rows, JUNE).some((r) => r.categoryId === "dining")).toBe(true);
  });
});
