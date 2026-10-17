import { describe, it, expect } from "vitest";
import {
  jarSpendable,
  POOL_DONOR_ID,
  POOL_DONOR_LABEL,
  previewTransfer,
  transferCapOf,
  transferEndpoints,
  validateTransfer,
  type JarBudgetLine,
  type TransferSnapshot,
} from "@/domain/engine";

function line(huId: string, balance: number | null): JarBudgetLine {
  return {
    huId,
    label: huId.toUpperCase(),
    categoryIds: [],
    spent: 0,
    prevSpent: 0,
    momDelta: 0,
    momPct: null,
    limit: null,
    limitState: "unset",
    rebalanceNet: 0,
    balance,
    pct: null,
    status: null,
    thresholdHit: false,
    source: "mock",
    freshness: null,
  };
}

/** Snapshot with jars given as `[id, balance]`; spendables derived like `snapshotForDate`. */
function snapshot(casaBalance: number, jars: [string, number | null][]): TransferSnapshot {
  const lines = jars.map(([id, b]) => line(id, b));
  return {
    casaBalance,
    lines,
    spendables: lines.map((l) => ({ id: l.huId, label: l.label, categoryIds: [], spendable: jarSpendable(l.balance) })),
  };
}

// a: 1.000.000, b: -200.000 (hết số dư), c: chưa có số dư. Pool = 5.000.000 − 1.000.000.
const ENDPOINTS = transferEndpoints(snapshot(5_000_000, [["a", 1_000_000], ["b", -200_000], ["c", null]]));

describe("transferEndpoints", () => {
  it("puts the pool first with the signed unallocated amount, then every jar", () => {
    expect(ENDPOINTS.map((e) => e.id)).toEqual([POOL_DONOR_ID, "a", "b", "c"]);
    expect(ENDPOINTS[0]).toEqual({ id: POOL_DONOR_ID, label: POOL_DONOR_LABEL, balance: 4_000_000, cap: 4_000_000 });
  });

  it("jar cap = max(0, balance); negative balance → cap 0; null stays null", () => {
    expect(transferCapOf(ENDPOINTS, "a")).toBe(1_000_000);
    expect(ENDPOINTS.find((e) => e.id === "b")).toMatchObject({ balance: -200_000, cap: 0 });
    expect(ENDPOINTS.find((e) => e.id === "c")).toMatchObject({ balance: null, cap: null });
    expect(transferCapOf(ENDPOINTS, "missing")).toBeNull();
  });

  it("over-allocated pool keeps its negative balance but caps at 0", () => {
    const [pool] = transferEndpoints(snapshot(500_000, [["a", 1_000_000]]));
    expect(pool).toMatchObject({ balance: -500_000, cap: 0 });
  });
});

describe("validateTransfer", () => {
  const check = (fromId: string, toId: string | null, amount: number | null) => validateTransfer({ fromId, toId, amount }, ENDPOINTS);

  it("accepts jar → jar, jar → pool and pool → jar within cap", () => {
    expect(check("a", "b", 300_000)).toEqual({ ok: true });
    expect(check("a", POOL_DONOR_ID, 1_000_000)).toEqual({ ok: true });
    expect(check(POOL_DONOR_ID, "a", 4_000_000)).toEqual({ ok: true });
  });

  it("allows odd whole-VND amounts (no 1.000 multiple)", () => {
    expect(check("a", "b", 123_457)).toEqual({ ok: true });
  });

  it("rejects the same jar on both sides", () => {
    expect(check("a", "a", 1)).toEqual({ ok: false, field: "to", message: "Hũ nhận phải khác hũ chuyển." });
  });

  it("rejects unknown endpoints and a missing destination", () => {
    expect(check("x", "a", 1)).toMatchObject({ ok: false, field: "from" });
    expect(check("a", "x", 1)).toMatchObject({ ok: false, field: "to" });
    expect(check("a", null, 1)).toMatchObject({ ok: false, field: "to" });
  });

  it("an unfunded jar can neither give nor receive", () => {
    expect(check("c", "a", 1)).toEqual({ ok: false, field: "from", message: "Hũ này chưa có số dư." });
    expect(check("a", "c", 1)).toEqual({ ok: false, field: "to", message: "Hũ này chưa có số dư." });
  });

  it("rejects non-positive, non-integer and non-finite amounts", () => {
    for (const amount of [null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(check("a", "b", amount)).toEqual({ ok: false, field: "amount", message: "Nhập số tiền lớn hơn 0." });
    }
  });

  it("rejects more than the source can give", () => {
    expect(check("a", "b", 1_000_001)).toEqual({ ok: false, field: "amount", message: "Tối đa 1.000.000 ₫." });
    expect(check("b", "a", 1)).toMatchObject({ ok: false, field: "amount", message: "Tối đa 0 ₫." });
  });

  it("an over-allocated pool cannot give anything", () => {
    const eps = transferEndpoints(snapshot(500_000, [["a", 1_000_000]]));
    expect(validateTransfer({ fromId: POOL_DONOR_ID, toId: "a", amount: 1 }, eps)).toMatchObject({ ok: false, field: "amount" });
  });
});

describe("previewTransfer", () => {
  it("moves the amount from one balance to the other", () => {
    expect(previewTransfer({ fromId: "a", toId: "b", amount: 300_000 }, ENDPOINTS)).toEqual({
      from: { before: 1_000_000, after: 700_000 },
      to: { before: -200_000, after: 100_000 },
    });
  });

  it("keeps null balances null and treats an invalid amount as 0", () => {
    expect(previewTransfer({ fromId: "a", toId: "c", amount: 1.5 }, ENDPOINTS)).toEqual({
      from: { before: 1_000_000, after: 1_000_000 },
      to: { before: null, after: null },
    });
    expect(previewTransfer({ fromId: "a", toId: null, amount: 1 }, ENDPOINTS).to).toEqual({ before: null, after: null });
  });
});
