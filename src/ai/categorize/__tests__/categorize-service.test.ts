import { describe, expect, it, vi } from "vitest";
import { categorize } from "../categorize-service";
import type { ClassifyFn, ClassifyResult } from "../types";
import type { CategoryMemory } from "@/state/category-memory";
import { txn } from "@/domain/engine/__tests__/helpers";
import { UNCLASSIFIED } from "@/domain/models";

const un = (over = {}) => txn({ categoryId: UNCLASSIFIED, type: "expense", ...over });
const fixed = (results: ClassifyResult[]): ClassifyFn => async () => results;

describe("categorize — validation", () => {
  it("drops a syntactically invalid categoryId (unknown id) — txn stays unclassified", async () => {
    const t = un({ id: "a", merchantNormalizedName: "zzz" });
    const out = await categorize({
      txns: [t],
      memory: {},
      classify: fixed([{ txnId: "a", categoryId: "not_a_category", confidence: 0.99 }]),
      classifyOrigin: "ai",
    });
    expect(out.assignments).toHaveLength(0);
  });

  it("drops the UNCLASSIFIED sentinel as a suggestion", async () => {
    const out = await categorize({
      txns: [un({ id: "a", merchantNormalizedName: "zzz" })],
      memory: {},
      classify: fixed([{ txnId: "a", categoryId: UNCLASSIFIED, confidence: 0.99 }]),
      classifyOrigin: "ai",
    });
    expect(out.assignments).toHaveLength(0);
  });

  it("drops a semantically wrong suggestion (income category for an expense txn) — Red Team #4", async () => {
    const out = await categorize({
      txns: [un({ id: "a", type: "expense", merchantNormalizedName: "zzz" })],
      memory: {},
      classify: fixed([{ txnId: "a", categoryId: "salary", confidence: 0.99 }]),
      classifyOrigin: "ai",
    });
    expect(out.assignments).toHaveLength(0);
  });

  it("ignores a hallucinated txnId not in the input", async () => {
    const out = await categorize({
      txns: [un({ id: "a", merchantNormalizedName: "zzz" })],
      memory: {},
      classify: fixed([{ txnId: "ghost", categoryId: "dining", confidence: 0.99 }]),
      classifyOrigin: "ai",
    });
    expect(out.assignments).toHaveLength(0);
  });
});

describe("categorize — confidence gate", () => {
  it("applies at/above threshold and pends below it", async () => {
    const txns = [un({ id: "hi", merchantNormalizedName: "a" }), un({ id: "lo", merchantNormalizedName: "b" })];
    const out = await categorize({
      txns,
      memory: {},
      classify: fixed([
        { txnId: "hi", categoryId: "dining", confidence: 0.8 },
        { txnId: "lo", categoryId: "dining", confidence: 0.79 },
      ]),
      classifyOrigin: "ai",
      threshold: 0.8,
    });
    const byId = Object.fromEntries(out.assignments.map((a) => [a.txnId, a]));
    expect(byId.hi.status).toBe("applied");
    expect(byId.lo.status).toBe("pending");
    expect(out.applied).toBe(1);
    expect(out.pending).toBe(1);
  });
});

describe("categorize — memory-first", () => {
  it("applies a valid memory hit WITHOUT calling the classifier", async () => {
    const memory: CategoryMemory = { "cho ba": { categoryId: "groceries", updatedAt: 1, hits: 3 } };
    const classify = vi.fn(fixed([]));
    const out = await categorize({
      txns: [un({ id: "a", merchantNormalizedName: "cho ba" })],
      memory,
      classify,
      classifyOrigin: "ai",
    });
    expect(classify).not.toHaveBeenCalled(); // nothing left to classify ⇒ no model call
    expect(out.assignments).toEqual([
      { txnId: "a", categoryId: "groceries", origin: "memory", status: "applied" },
    ]);
    expect(out.memoryApplied).toBe(1);
  });

  it("treats a dead memory id as a miss, reports it, and re-classifies (Red Team #5)", async () => {
    const memory: CategoryMemory = { "cho ba": { categoryId: "ghost", updatedAt: 1, hits: 1 } };
    const classify = vi.fn(fixed([{ txnId: "a", categoryId: "groceries", confidence: 0.9 }]));
    const out = await categorize({
      txns: [un({ id: "a", merchantNormalizedName: "cho ba" })],
      memory,
      classify,
      classifyOrigin: "ai",
    });
    expect(out.deadMemoryKeys).toContain("cho ba");
    expect(classify.mock.calls[0][0]).toHaveLength(1); // fell through to classifier
    expect(out.assignments[0]).toMatchObject({ txnId: "a", categoryId: "groceries", origin: "ai" });
  });
});

describe("categorize — chunking + isolation", () => {
  it("splits >chunkSize txns into chunks and isolates a failing chunk (Red Team #14)", async () => {
    const txns = Array.from({ length: 5 }, (_, i) => un({ id: `t${i}`, merchantNormalizedName: `m${i}` }));
    let call = 0;
    const classify: ClassifyFn = async (inputs) => {
      call++;
      if (call === 1) throw new Error("chunk boom");
      return inputs.map((i) => ({ txnId: i.txnId, categoryId: "dining", confidence: 0.9 }));
    };
    const out = await categorize({ txns, memory: {}, classify, classifyOrigin: "ai", chunkSize: 2 });
    // 5 txns → chunks of 2,2,1. First chunk throws (2 lost), rest yield 3.
    expect(out.chunkErrors).toBe(1);
    expect(out.assignments).toHaveLength(3);
  });
});

describe("categorize — eligibility", () => {
  it("ignores non-unclassified and non-eligible-type txns", async () => {
    const txns = [
      txn({ id: "classified", categoryId: "dining", type: "expense" }),
      un({ id: "transfer", type: "transfer" }), // sentinel but ineligible type
    ];
    const classify = vi.fn(fixed([]));
    const out = await categorize({ txns, memory: {}, classify, classifyOrigin: "ai" });
    expect(classify).not.toHaveBeenCalled(); // nothing eligible
    expect(out.assignments).toHaveLength(0);
  });
});
