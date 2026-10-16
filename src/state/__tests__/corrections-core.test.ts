import { describe, expect, it } from "vitest";
import {
  applyCorrections,
  mergeAssignments,
  normalize,
  promoteToUser,
  resolveEffective,
  type Assignment,
  type Corrections,
} from "../corrections-core";
import { txn } from "@/domain/engine/__tests__/helpers";
import { UNCLASSIFIED } from "@/domain/models";

describe("normalize (migration)", () => {
  it("migrates a legacy flat string map to origin:user, status:applied", () => {
    expect(normalize({ t1: "transport" })).toEqual({
      t1: { categoryId: "transport", origin: "user", status: "applied" },
    });
  });

  it("defaults an object record with no origin to user/applied", () => {
    expect(normalize({ t1: { categoryId: "dining" } })).toEqual({
      t1: { categoryId: "dining", origin: "user", status: "applied" },
    });
  });

  it("preserves an ai assignment's origin, confidence and pending status", () => {
    const out = normalize({ t1: { categoryId: "dining", origin: "ai", confidence: 0.9, status: "pending" } });
    expect(out.t1).toEqual({ categoryId: "dining", origin: "ai", confidence: 0.9, status: "pending" });
  });

  it("drops confidence on a user record", () => {
    const out = normalize({ t1: { categoryId: "dining", origin: "user", confidence: 0.5 } });
    expect(out.t1.confidence).toBeUndefined();
  });
});

describe("resolveEffective (guarded resolver)", () => {
  it("applies a valid applied override and flags userEdited for user origin", () => {
    const out = resolveEffective(txn({ id: "a", categoryId: "dining" }), {
      categoryId: "transport",
      origin: "user",
      status: "applied",
    });
    expect(out.categoryId).toBe("transport");
    expect(out.userEdited).toBe(true);
  });

  it("does NOT flag userEdited for an ai-applied override", () => {
    const out = resolveEffective(txn({ id: "a", categoryId: "dining", userEdited: false }), {
      categoryId: "transport",
      origin: "ai",
      status: "applied",
    });
    expect(out.categoryId).toBe("transport");
    expect(out.userEdited).toBe(false);
  });

  it("leaves the category unchanged for a PENDING assignment (invariant #6)", () => {
    const t = txn({ id: "a", categoryId: UNCLASSIFIED });
    const out = resolveEffective(t, { categoryId: "dining", origin: "ai", status: "pending" });
    expect(out.categoryId).toBe(UNCLASSIFIED);
    expect(out).toBe(t); // untouched reference
  });

  it("falls back to the original category for an ORPHANED id (never drops/throws)", () => {
    const t = txn({ id: "a", categoryId: "dining" });
    const out = resolveEffective(t, { categoryId: "ghost_category", origin: "user", status: "applied" });
    expect(out.categoryId).toBe("dining");
    expect(out).toBe(t);
  });
});

describe("mergeAssignments (race guard)", () => {
  const a = (over: Partial<Assignment>): Assignment => ({
    txnId: "x",
    categoryId: "dining",
    origin: "ai",
    status: "pending",
    ...over,
  });

  it("adds new assignments", () => {
    const out = mergeAssignments({}, [a({ txnId: "x", categoryId: "dining" })]);
    expect(out.x).toMatchObject({ categoryId: "dining", origin: "ai", status: "pending" });
  });

  it("NEVER overwrites a user-origin record (Red Team #6)", () => {
    const prev: Corrections = { x: { categoryId: "groceries", origin: "user", status: "applied" } };
    const out = mergeAssignments(prev, [a({ txnId: "x", categoryId: "dining" })]);
    expect(out.x.categoryId).toBe("groceries");
    expect(out.x.origin).toBe("user");
  });

  it("treats a legacy (origin-absent) record as user and protects it", () => {
    const prev: Corrections = { x: { categoryId: "groceries" } };
    const out = mergeAssignments(prev, [a({ txnId: "x", categoryId: "dining" })]);
    expect(out.x.categoryId).toBe("groceries");
  });

  it("preserves an existing hidden flag when applying an assignment", () => {
    const prev: Corrections = { x: { hidden: true } };
    const out = mergeAssignments(prev, [a({ txnId: "x", categoryId: "dining", status: "applied" })]);
    expect(out.x.hidden).toBe(true);
    expect(out.x.categoryId).toBe("dining");
  });
});

describe("promoteToUser", () => {
  it("sets origin:user, applied and clears confidence", () => {
    const prev: Corrections = { x: { categoryId: "dining", origin: "ai", confidence: 0.4, status: "pending" } };
    const out = promoteToUser(prev, "x", "transport");
    // status "applied" is the default (absent), so tidy() omits it.
    expect(out.x).toEqual({ categoryId: "transport", origin: "user" });
    expect(out.x.status).toBeUndefined();
    expect(out.x.confidence).toBeUndefined();
  });
});

describe("applyCorrections", () => {
  it("is a no-op for an empty overlay", () => {
    const txns = [txn({ id: "a" })];
    expect(applyCorrections(txns, {})).toBe(txns);
  });
});
