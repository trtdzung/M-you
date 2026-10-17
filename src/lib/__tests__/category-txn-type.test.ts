import { describe, expect, it } from "vitest";
import { typeForCategory } from "../category-txn-type";
import { CATEGORY, type CategoryKind } from "@/domain/models";

/**
 * The txn `type` is DERIVED from the category's kind, and the derivation is
 * asymmetric on purpose: the engine EXCLUDES `transfer` from expense, so an id we
 * fail to resolve must never come out as a transfer — that would erase real spend
 * from every total with no error (invariant #6). The reverse mistake only counts
 * money the user did spend.
 */

const taxonomy = (entries: [string, CategoryKind][]) =>
  new Map(entries.map(([id, kind]) => [id, { kind }]));

describe("typeForCategory", () => {
  it("types the system transfer category as a transfer (bundled fallback)", () => {
    expect(typeForCategory(CATEGORY.transfer)).toBe("transfer");
    expect(typeForCategory(CATEGORY.dining)).toBe("expense");
  });

  it("resolves a CUSTOM category to expense from the stored taxonomy", () => {
    const stored = taxonomy([
      ["c_hoc-phi", "expense"],
      ["transfer", "transfer"],
    ]);
    expect(typeForCategory("c_hoc-phi", stored)).toBe("expense");
    expect(typeForCategory("transfer", stored)).toBe("transfer");
  });

  it("NEVER defaults an unresolved id to transfer — with or without a taxonomy", () => {
    expect(typeForCategory("c_not-loaded-yet", taxonomy([["dining", "expense"]]))).toBe("expense");
    expect(typeForCategory("c_not-loaded-yet")).toBe("expense");
    expect(typeForCategory("")).toBe("expense");
  });

  it("uses the passed taxonomy, not the bundled constant, when one is given", () => {
    // A persona whose taxonomy is still loading holds no ids at all: the answer
    // is the safe direction, never "transfer".
    expect(typeForCategory("dining", taxonomy([]))).toBe("expense");
  });
});
