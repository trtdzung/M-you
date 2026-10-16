import { describe, it, expect } from "vitest";
import type { PendingTxn } from "../jar-envelope";
import { buildAllocationRows } from "../allocation-plan";

function txn(txnId: string, remaining: number): PendingTxn {
  return { txnId, income: remaining, allocated: 0, remaining };
}

describe("buildAllocationRows", () => {
  it("fills one jar from a single txn", () => {
    const rows = buildAllocationRows([txn("i1", 5_000_000)], { food: 2_000_000 });
    expect(rows).toEqual([{ txnId: "i1", jarId: "food", amount: 2_000_000 }]);
  });

  it("draws FIFO across multiple txns for one jar target", () => {
    const rows = buildAllocationRows([txn("i1", 1_000_000), txn("i2", 3_000_000)], { food: 2_500_000 });
    expect(rows).toEqual([
      { txnId: "i1", jarId: "food", amount: 1_000_000 },
      { txnId: "i2", jarId: "food", amount: 1_500_000 },
    ]);
  });

  it("shares capacity across jars in key order (no txn over-drawn)", () => {
    const rows = buildAllocationRows([txn("i1", 5_000_000)], { food: 2_000_000, bills: 3_000_000 });
    expect(rows).toEqual([
      { txnId: "i1", jarId: "food", amount: 2_000_000 },
      { txnId: "i1", jarId: "bills", amount: 3_000_000 },
    ]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(5_000_000);
  });

  it("leaves a target short when capacity runs out (never over-draws)", () => {
    const rows = buildAllocationRows([txn("i1", 1_000_000)], { food: 4_000_000 });
    expect(rows).toEqual([{ txnId: "i1", jarId: "food", amount: 1_000_000 }]);
  });

  it("skips zero / negative / non-finite targets and zero-capacity txns", () => {
    const rows = buildAllocationRows([txn("i1", 0), txn("i2", 2_000_000)], {
      food: 0,
      bills: -5,
      fun: Number.NaN,
      khac: 1_000_000,
    });
    expect(rows).toEqual([{ txnId: "i2", jarId: "khac", amount: 1_000_000 }]);
  });

  it("floors a fractional target to whole VND", () => {
    const rows = buildAllocationRows([txn("i1", 5_000_000)], { food: 1_000_000.75 });
    expect(rows).toEqual([{ txnId: "i1", jarId: "food", amount: 1_000_000 }]);
  });

  it("is deterministic", () => {
    const perTxn = [txn("i1", 2_000_000), txn("i2", 2_000_000)];
    const a = buildAllocationRows(perTxn, { food: 3_000_000 });
    const b = buildAllocationRows(perTxn, { food: 3_000_000 });
    expect(a).toEqual(b);
  });
});
