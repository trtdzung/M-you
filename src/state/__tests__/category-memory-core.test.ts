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
});
