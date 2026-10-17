import { describe, expect, it } from "vitest";
import { FIXED_CATEGORY_IDS } from "@/domain/models";
import { aggregateCashflow, netExpenseByCategory } from "../cashflow";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5); // 06/2026

/**
 * Invariant lock for the transfer-category feature: a `type:"transfer"` record
 * (the default for an account-sourced transfer, or a 0-category jar) is excluded
 * from income/expense by TYPE — not by category — so re-categorizing it to an
 * expense is what makes it count. Engine is the source of financial truth; the
 * feature only changes a txn's category/type, never the engine.
 */
describe("cashflow — transfer category classification", () => {
  it("excludes a transfer txn from expense and from spending-by-category", () => {
    const result = aggregateCashflow(
      [
        txn({ id: "tr", type: "transfer", categoryId: "dining", amount: 500_000 }),
        txn({ id: "ex", type: "expense", categoryId: "dining", amount: 200_000 }),
      ],
      JUNE,
      FIXED_CATEGORY_IDS,
    );
    // Only the real expense counts, even though both carry categoryId "dining".
    expect(result.expense).toBe(200_000);
    expect(result.byCategory).toEqual([{ categoryId: "dining", amount: 200_000 }]);
    expect(netExpenseByCategory([txn({ id: "tr", type: "transfer", categoryId: "dining", amount: 500_000 })], JUNE).size).toBe(0);
  });

  it("counts the amount once a transfer is re-categorized to an expense", () => {
    const asTransfer = netExpenseByCategory([txn({ type: "transfer", categoryId: "shopping", amount: 300_000 })], JUNE);
    const asExpense = netExpenseByCategory([txn({ type: "expense", categoryId: "shopping", amount: 300_000 })], JUNE);
    expect(asTransfer.get("shopping") ?? 0).toBe(0);
    expect(asExpense.get("shopping")).toBe(300_000);
  });
});
