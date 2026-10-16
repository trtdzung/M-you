import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Transaction } from "@/domain/models";
import { TransactionListSection } from "@/components/transactions/TransactionListSection";

/**
 * Phase 03 red-team #3: tapping a category in Dòng tiền drills to `/transactions
 * ?category=<id>`, which seeds `TransactionListSection` via `initialCategoryId`.
 * The list must open already filtered to that category — no manual re-filter.
 */

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    accountId: "acc_current",
    postedAt: over.postedAt ?? "2026-06-10T10:00:00.000Z",
    amount: over.amount ?? 100_000,
    currency: "VND",
    direction: "debit",
    type: "expense",
    merchantName: over.merchantName ?? "Cửa hàng",
    merchantNormalizedName: over.merchantNormalizedName ?? "cua hang",
    categoryId: over.categoryId ?? "dining",
    status: "posted",
    source: "mock",
    isRecurring: false,
    userEdited: false,
  };
}

const txns: Transaction[] = [
  txn({ categoryId: "dining", merchantName: "Quán Phở", merchantNormalizedName: "quan pho" }),
  txn({ categoryId: "transport", merchantName: "Grab Bike", merchantNormalizedName: "grab bike" }),
  txn({ categoryId: "groceries", merchantName: "Bách Hóa", merchantNormalizedName: "bach hoa" }),
];

describe("TransactionListSection drill-in (initialCategoryId)", () => {
  it("seeds the category filter and shows only that category's rows", () => {
    render(
      <TransactionListSection transactions={txns} month="2026-06" loading={false} initialCategoryId="dining" />,
    );

    const select = screen.getByLabelText("Lọc theo danh mục") as HTMLSelectElement;
    expect(select.value).toBe("dining");
    expect(screen.getByText("Quán Phở")).toBeInTheDocument();
    expect(screen.queryByText("Grab Bike")).not.toBeInTheDocument();
    expect(screen.queryByText("Bách Hóa")).not.toBeInTheDocument();
  });

  it("shows all categories when no initialCategoryId is supplied", () => {
    render(<TransactionListSection transactions={txns} month="2026-06" loading={false} />);

    const select = screen.getByLabelText("Lọc theo danh mục") as HTMLSelectElement;
    expect(select.value).toBe("all");
    expect(screen.getByText("Quán Phở")).toBeInTheDocument();
    expect(screen.getByText("Grab Bike")).toBeInTheDocument();
  });
});
