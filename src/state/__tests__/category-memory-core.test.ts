import { describe, expect, it } from "vitest";
import { isMemorableCategory, lookupMemory, normalizeMerchantKey, type CategoryMemory } from "../category-memory";
import { UNCLASSIFIED } from "@/domain/models";

describe("normalizeMerchantKey", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeMerchantKey("  Highlands   Coffee ")).toBe("highlands coffee");
    expect(normalizeMerchantKey("GRAB")).toBe("grab");
  });
});

describe("isMemorableCategory (validate on write — Red Team #5)", () => {
  it("accepts a real spending category", () => {
    expect(isMemorableCategory("dining")).toBe(true);
  });
  it("rejects the UNCLASSIFIED sentinel and unknown ids", () => {
    expect(isMemorableCategory(UNCLASSIFIED)).toBe(false);
    expect(isMemorableCategory("ghost")).toBe(false);
  });

  /**
   * Against the bundled presets a CUSTOM category can never be learned — the
   * whole "learn from corrections" feature is silently dead for every category
   * the user created. Validation runs against the persona's STORED set instead.
   */
  it("accepts a custom category when the stored assignable set is passed", () => {
    const stored = new Set(["dining", "c_hoc-phi"]);
    expect(isMemorableCategory("c_hoc-phi", stored)).toBe(true);
    expect(isMemorableCategory("c_hoc-phi")).toBe(false); // the bug, without the set
  });

  it("still rejects the sentinel, and an id the stored set no longer has", () => {
    const stored = new Set(["dining", UNCLASSIFIED]); // even if it somehow appeared
    expect(isMemorableCategory(UNCLASSIFIED, stored)).toBe(false);
    expect(isMemorableCategory("shopping", stored)).toBe(false); // archived/deleted
  });
});

describe("lookupMemory (validate on read — Red Team #5)", () => {
  it("returns the mapped category on a hit", () => {
    const m: CategoryMemory = { "highlands coffee": { categoryId: "dining", updatedAt: 1, hits: 2 } };
    expect(lookupMemory(m, "Highlands  Coffee")).toEqual({ categoryId: "dining" });
  });

  it("returns empty on a miss", () => {
    expect(lookupMemory({}, "unknown")).toEqual({});
  });

  it("treats a dead id as a miss and reports the dead key", () => {
    const m: CategoryMemory = { grab: { categoryId: "ghost", updatedAt: 1, hits: 1 } };
    expect(lookupMemory(m, "grab")).toEqual({ deadKey: "grab" });
  });

  it("hits on a custom category against the stored set, and prunes it once archived", () => {
    const m: CategoryMemory = { "trường abc": { categoryId: "c_hoc-phi", updatedAt: 1, hits: 1 } };
    expect(lookupMemory(m, "Trường ABC", new Set(["c_hoc-phi"]))).toEqual({ categoryId: "c_hoc-phi" });
    expect(lookupMemory(m, "Trường ABC", new Set(["dining"]))).toEqual({ deadKey: "trường abc" });
  });
});
