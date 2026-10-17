// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@/domain/models";

vi.mock("server-only", () => ({}));

const live = vi.hoisted(() => ({ txns: [] as Transaction[], lastCif: "" }));
vi.mock("@/app/api/jars/jar-write-guards", () => ({
  liveTxns: (cif: string) => {
    live.lastCif = cif;
    return live.txns;
  },
}));

vi.mock("@/lib/categories-store", () => ({
  readCategories: () => [{ id: "food", label: "Ăn uống" }],
}));

import { goalCashflowInput } from "../cashflow-input";

const NOW = new Date("2026-09-15T00:00:00.000Z");

function txn(overrides: Partial<Transaction> & Pick<Transaction, "id" | "postedAt" | "amount" | "type" | "categoryId" | "status">): Transaction {
  return {
    accountId: "acc",
    currency: "VND",
    direction: overrides.type === "income" ? "credit" : "debit",
    merchantName: "x",
    merchantNormalizedName: "x",
    source: "mock",
    isRecurring: false,
    userEdited: false,
    ...overrides,
  };
}

beforeEach(() => {
  live.txns = [];
  live.lastCif = "";
});

describe("goalCashflowInput", () => {
  it("folds the three closed months before now and averages categories over months that have data", () => {
    live.txns = [
      txn({ id: "in-jun", postedAt: "2026-06-15T00:00:00.000Z", amount: 20_000_000, type: "income", categoryId: "salary", status: "posted" }),
      txn({ id: "food-jun", postedAt: "2026-06-16T00:00:00.000Z", amount: 8_000_000, type: "expense", categoryId: "food", status: "posted" }),
      txn({ id: "rent-jun", postedAt: "2026-06-17T00:00:00.000Z", amount: 3_000_000, type: "expense", categoryId: "rent", status: "posted" }),
      txn({ id: "wash-out", postedAt: "2026-06-18T00:00:00.000Z", amount: 100, type: "expense", categoryId: "wash", status: "posted" }),
      txn({ id: "wash-back", postedAt: "2026-06-19T00:00:00.000Z", amount: 100, type: "refund", categoryId: "wash", status: "posted" }),
      txn({ id: "jul-reversed", postedAt: "2026-07-15T00:00:00.000Z", amount: 9_000_000, type: "expense", categoryId: "food", status: "reversed" }),
      txn({ id: "in-aug", postedAt: "2026-08-15T00:00:00.000Z", amount: 16_000_000, type: "income", categoryId: "salary", status: "posted" }),
      txn({ id: "food-aug", postedAt: "2026-08-16T00:00:00.000Z", amount: 2_000_000, type: "expense", categoryId: "food", status: "posted" }),
      txn({ id: "gift-aug", postedAt: "2026-08-17T00:00:00.000Z", amount: 500, type: "refund", categoryId: "gift", status: "posted" }),
      txn({ id: "pend-aug", postedAt: "2026-08-18T00:00:00.000Z", amount: 50_000, type: "expense", categoryId: "food", status: "pending" }),
      txn({ id: "this-month", postedAt: "2026-09-10T00:00:00.000Z", amount: 99_000_000, type: "income", categoryId: "salary", status: "posted" }),
      txn({ id: "too-old", postedAt: "2026-05-10T00:00:00.000Z", amount: 99_000_000, type: "expense", categoryId: "food", status: "posted" }),
    ];

    const result = goalCashflowInput("CIF/1", NOW);
    expect(live.lastCif).toBe("CIF/1");
    expect(result.months).toEqual([
      { monthKey: "2026-06", income: 20_000_000, expense: 11_000_000, txnCount: 5 },
      { monthKey: "2026-07", income: 0, expense: 0, txnCount: 0 },
      { monthKey: "2026-08", income: 16_000_000, expense: 1_999_500, txnCount: 4 },
    ]);
    expect(result.categoryAverages).toEqual([
      { categoryId: "food", label: "Ăn uống", average: 5_000_000 },
      { categoryId: "rent", label: null, average: 1_500_000 },
    ]);
  });

  it("returns three empty months and no categories when there are no transactions", () => {
    const result = goalCashflowInput("CIF_0001", NOW);
    expect(result.months).toEqual([
      { monthKey: "2026-06", income: 0, expense: 0, txnCount: 0 },
      { monthKey: "2026-07", income: 0, expense: 0, txnCount: 0 },
      { monthKey: "2026-08", income: 0, expense: 0, txnCount: 0 },
    ]);
    expect(result.categoryAverages).toEqual([]);
  });
});
