import { describe, it, expect } from "vitest";
import type { JarAllocation, JarConfig, Transaction } from "@/domain/models";
import { monthPeriod } from "../types";
import { evaluateJarEnvelope, jarEnvelopeLines } from "../jar-envelope";

const PERIOD = monthPeriod(2026, 8); // 09/2026
const IN = "2026-09-10T00:00:00.000Z";

function income(id: string, amount: number, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    accountId: "acc1",
    postedAt: IN,
    amount,
    currency: "VND",
    direction: "credit",
    type: "income",
    merchantName: "Lương",
    merchantNormalizedName: "luong",
    categoryId: "salary",
    status: "posted",
    source: "mock",
    isRecurring: false,
    userEdited: false,
    ...over,
  };
}

function expense(id: string, amount: number, categoryId: string): Transaction {
  return {
    id,
    accountId: "acc1",
    postedAt: IN,
    amount,
    currency: "VND",
    direction: "debit",
    type: "expense",
    merchantName: "Shop",
    merchantNormalizedName: "shop",
    categoryId,
    status: "posted",
    source: "mock",
    isRecurring: false,
    userEdited: false,
  };
}

function alloc(txnId: string, jarId: string, amount: number, id = `${txnId}-${jarId}`): JarAllocation {
  return { id, txnId, jarId, amount, source: "self_reported", createdAt: IN };
}

const CONFIG: JarConfig = {
  version: 3,
  jars: [
    { id: "food", label: "Ăn uống", categoryIds: ["food"] },
    { id: "bills", label: "Hóa đơn", categoryIds: ["bills"] },
    { id: "khac", label: "Khác", categoryIds: [] },
  ],
};

const NO_SPEND = new Map<string, number>();

describe("evaluateJarEnvelope — pending (chờ phân bổ)", () => {
  it("no income → pending unknown, empty perTxn (never 0)", () => {
    const res = evaluateJarEnvelope(CONFIG, [], [], NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe("unknown");
    expect(res.pending.unallocatedCount).toBe(0);
    expect(res.pending.perTxn).toEqual([]);
  });

  it("income, no allocations → all pending, count = number of income txns", () => {
    const txns = [income("i1", 5_000_000), income("i2", 3_000_000)];
    const res = evaluateJarEnvelope(CONFIG, txns, [], NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe(8_000_000);
    expect(res.pending.unallocatedCount).toBe(2);
    expect(res.pending.unallocatedTxnIds).toEqual(["i1", "i2"]);
  });

  it("fully allocated income → pending 0, count 0 (known, not unknown)", () => {
    const txns = [income("i1", 5_000_000)];
    const allocs = [alloc("i1", "food", 2_000_000), alloc("i1", "bills", 3_000_000)];
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe(0);
    expect(res.pending.unallocatedCount).toBe(0);
  });

  it("partial allocation → correct remaining + count (a partly-split txn still counts)", () => {
    const txns = [income("i1", 5_000_000), income("i2", 3_000_000)];
    const allocs = [alloc("i1", "food", 2_000_000)];
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe(6_000_000); // 3m left on i1 + 3m on i2
    expect(res.pending.unallocatedCount).toBe(2);
  });
});

describe("evaluateJarEnvelope — funded / còn lại trong hũ", () => {
  it("funded = period income allocated in; remaining = funded − spent", () => {
    const txns = [income("i1", 5_000_000)];
    const allocs = [alloc("i1", "food", 2_000_000)];
    const spent = new Map([["food", 800_000]]);
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, spent, PERIOD);
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.funded).toBe(2_000_000);
    expect(food.spent).toBe(800_000);
    expect(food.remaining).toBe(1_200_000);
    expect(food.inUse).toBe(true);
  });

  it("unfunded jar → funded/remaining null, inUse false (never 0)", () => {
    const txns = [income("i1", 5_000_000)];
    const res = evaluateJarEnvelope(CONFIG, txns, [], NO_SPEND, PERIOD);
    const bills = res.jars.find((j) => j.jarId === "bills")!;
    expect(bills.funded).toBeNull();
    expect(bills.remaining).toBeNull();
    expect(bills.inUse).toBe(false);
  });

  it("remaining may be negative when spent exceeds funded (overspent, never coerced)", () => {
    const txns = [income("i1", 5_000_000)];
    const allocs = [alloc("i1", "food", 1_000_000)];
    const spent = new Map([["food", 1_500_000]]);
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, spent, PERIOD);
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.remaining).toBe(-500_000);
  });
});

describe("evaluateJarEnvelope — robustness (RT-3 inert, RT-4 orphan fold)", () => {
  it("allocation to a non-income / unknown txn is inert (no pending drop, no funding)", () => {
    const txns = [income("i1", 5_000_000), expense("e1", 999, "food")];
    const allocs = [alloc("bogus-txn", "food", 1_000_000), alloc("e1", "food", 1_000_000)];
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe(5_000_000); // unchanged
    expect(res.jars.find((j) => j.jarId === "food")!.funded).toBeNull();
  });

  it("allocation to a jar no longer in config folds funded into Khác", () => {
    const txns = [income("i1", 5_000_000)];
    const allocs = [alloc("i1", "deleted-jar", 2_000_000)];
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    const khac = res.jars.find((j) => j.jarId === "khac")!;
    expect(khac.funded).toBe(2_000_000);
    expect(res.pending.amount).toBe(3_000_000); // pending still dropped
  });

  it("over-allocating a txn is capped at its income (FIFO)", () => {
    const txns = [income("i1", 5_000_000)];
    const allocs = [alloc("i1", "food", 4_000_000, "a1"), alloc("i1", "bills", 4_000_000, "a2")];
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    const food = res.jars.find((j) => j.jarId === "food")!;
    const bills = res.jars.find((j) => j.jarId === "bills")!;
    expect(food.funded).toBe(4_000_000);
    expect(bills.funded).toBe(1_000_000); // only 1m capacity left
    expect(res.pending.amount).toBe(0);
  });
});

describe("evaluateJarEnvelope — coherence identity", () => {
  it("pending.amount + Σ funded == period income", () => {
    const txns = [income("i1", 5_000_000), income("i2", 3_000_000)];
    const allocs = [
      alloc("i1", "food", 2_000_000),
      alloc("i1", "bills", 1_000_000),
      alloc("i2", "food", 3_000_000),
      alloc("i-missing", "food", 9_000_000), // inert
      alloc("i1", "deleted", 500_000), // folds to Khác
    ];
    const res = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    const totalFunded = res.jars.reduce((s, j) => s + (j.funded ?? 0), 0);
    expect((res.pending.amount as number) + totalFunded).toBe(8_000_000);
  });

  it("is deterministic (same inputs → same output)", () => {
    const txns = [income("i1", 5_000_000)];
    const allocs = [alloc("i1", "food", 2_000_000)];
    const a = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    const b = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    expect(a).toEqual(b);
  });
});

describe("allocation lifecycle (Phase 03) — jar delete preserves funds + identity", () => {
  it("allocate to a jar, then delete it → funds fold to Khác, identity still holds", () => {
    const txns = [income("i1", 5_000_000)];
    const allocs = [alloc("i1", "food", 2_000_000)];

    // Before delete: funded under "food".
    const before = evaluateJarEnvelope(CONFIG, txns, allocs, NO_SPEND, PERIOD);
    expect(before.jars.find((j) => j.jarId === "food")!.funded).toBe(2_000_000);

    // After delete: config no longer has "food" (its categories moved to Khác).
    const afterConfig: JarConfig = {
      version: 3,
      jars: [
        { id: "bills", label: "Hóa đơn", categoryIds: ["bills"] },
        { id: "khac", label: "Khác", categoryIds: ["food"] },
      ],
    };
    const after = evaluateJarEnvelope(afterConfig, txns, allocs, NO_SPEND, PERIOD);
    expect(after.jars.find((j) => j.jarId === "food")).toBeUndefined();
    expect(after.jars.find((j) => j.jarId === "khac")!.funded).toBe(2_000_000);

    const totalFunded = after.jars.reduce((s, j) => s + (j.funded ?? 0), 0);
    expect((after.pending.amount as number) + totalFunded).toBe(5_000_000);
  });
});

describe("jarEnvelopeLines — synthesize Khác when orphan funding but no Khác jar", () => {
  it("adds a Khác line for orphan funding when config has none", () => {
    const configNoKhac: JarConfig = { version: 3, jars: [{ id: "food", label: "Ăn uống", categoryIds: ["food"] }] };
    const lines = jarEnvelopeLines(configNoKhac, new Map([["gone", 1_000_000]]), NO_SPEND);
    const khac = lines.find((l) => l.jarId === "khac");
    expect(khac?.funded).toBe(1_000_000);
  });
});
