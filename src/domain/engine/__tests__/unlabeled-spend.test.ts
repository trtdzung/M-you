import { describe, it, expect } from "vitest";
import { UNCLASSIFIED } from "@/domain/models";
import { monthPeriodFromKey } from "../types";
import { selectUnlabeledSpend } from "../unlabeled-spend";
import { txn } from "./helpers";

const PERIOD = monthPeriodFromKey("2026-06"); // 06/2026
const IN = "2026-06-10T10:00:00.000Z";

describe("selectUnlabeledSpend", () => {
  it("counts posted, in-period, unclassified expenses; sums positive VND magnitudes", () => {
    const a = txn({ id: "a", categoryId: UNCLASSIFIED, amount: 120_000, postedAt: IN });
    const b = txn({ id: "b", categoryId: UNCLASSIFIED, amount: 80_000, postedAt: IN });
    const res = selectUnlabeledSpend([a, b], PERIOD);

    expect(res.count).toBe(2);
    expect(res.amount).toBe(200_000);
    expect(res.items.map((t) => t.id)).toEqual(["a", "b"]);
    expect(res.items.length).toBe(res.count); // parity by construction
    expect(res.source).toBe("mock");
  });

  it("[RT#2] excludes reversed unclassified expenses (invariant #6)", () => {
    const posted = txn({ id: "p", categoryId: UNCLASSIFIED, amount: 100_000, postedAt: IN });
    const reversed = txn({ id: "r", categoryId: UNCLASSIFIED, amount: 100_000, postedAt: IN, status: "reversed" });
    const res = selectUnlabeledSpend([posted, reversed], PERIOD);

    expect(res.count).toBe(1);
    expect(res.items.map((t) => t.id)).toEqual(["p"]);
  });

  it("[RT#2] excludes pending unclassified expenses (kept separate from posted)", () => {
    const posted = txn({ id: "p", categoryId: UNCLASSIFIED, amount: 100_000, postedAt: IN });
    const pending = txn({ id: "q", categoryId: UNCLASSIFIED, amount: 100_000, postedAt: IN, status: "pending" });
    const res = selectUnlabeledSpend([posted, pending], PERIOD);

    expect(res.count).toBe(1);
    expect(res.items.map((t) => t.id)).toEqual(["p"]);
  });

  it("excludes already-labeled expenses", () => {
    const labeled = txn({ id: "l", categoryId: "dining", amount: 100_000, postedAt: IN });
    const res = selectUnlabeledSpend([labeled], PERIOD);
    expect(res.count).toBe(0);
    expect(res.amount).toBe(0);
  });

  it("excludes non-expense types even when unclassified (transfer / income)", () => {
    const transfer = txn({ id: "t", categoryId: UNCLASSIFIED, type: "transfer", amount: 500_000, postedAt: IN });
    const income = txn({ id: "i", categoryId: UNCLASSIFIED, type: "income", amount: 500_000, postedAt: IN });
    const res = selectUnlabeledSpend([transfer, income], PERIOD);
    expect(res.count).toBe(0);
  });

  it("excludes out-of-period transactions", () => {
    // VN business time (UTC+7): 31/05 23:00 VN is May; 01/07 00:30 VN is July.
    const before = txn({ id: "b", categoryId: UNCLASSIFIED, amount: 100_000, postedAt: "2026-05-31T16:00:00.000Z" });
    const after = txn({ id: "a", categoryId: UNCLASSIFIED, amount: 100_000, postedAt: "2026-06-30T17:30:00.000Z" });
    const res = selectUnlabeledSpend([before, after], PERIOD);
    expect(res.count).toBe(0);
  });

  it("empty input → zeroed summary with empty items and mock source", () => {
    expect(selectUnlabeledSpend([], PERIOD)).toEqual({ count: 0, amount: 0, items: [], source: "mock" });
  });

  it("is deterministic: same input yields the same output", () => {
    const txns = [
      txn({ id: "a", categoryId: UNCLASSIFIED, amount: 120_000, postedAt: IN }),
      txn({ id: "b", categoryId: UNCLASSIFIED, amount: 80_000, postedAt: IN }),
    ];
    expect(selectUnlabeledSpend(txns, PERIOD)).toEqual(selectUnlabeledSpend(txns, PERIOD));
  });
});
