import { describe, expect, it } from "vitest";
import type { Jar } from "@/domain/models";
import { categoryColor, CATEGORY_COLOR_FALLBACK } from "@/lib/category-colors";
import { nextCategoryPatch, toggleCategoryId } from "../hu-category-patch";

/**
 * Pure logic behind one `HuCategoryPicker` toggle (phase-01 plan,
 * `plans/260920-1019-jar-category-ux-rework/phase-01-jar-editor-category-picker.md`,
 * deterministic tests 1-5). No React, no network.
 */

describe("toggleCategoryId", () => {
  it("appends the id when absent", () => {
    expect(toggleCategoryId(["dining", "groceries"], "transport")).toEqual([
      "dining",
      "groceries",
      "transport",
    ]);
  });

  it("removes the id when present, preserving the order of the survivors", () => {
    expect(toggleCategoryId(["dining", "groceries", "transport"], "groceries")).toEqual([
      "dining",
      "transport",
    ]);
  });

  it("never duplicates: toggling twice returns to the removed id appended, not doubled", () => {
    const once = toggleCategoryId(["dining"], "dining");
    expect(once).toEqual([]);
    const twice = toggleCategoryId(once, "dining");
    expect(twice).toEqual(["dining"]);
  });

  it("never mutates the input array (add case)", () => {
    const ids = ["dining", "groceries"];
    const snapshot = [...ids];
    toggleCategoryId(ids, "transport");
    expect(ids).toEqual(snapshot);
  });

  it("never mutates the input array (remove case)", () => {
    const ids = ["dining", "groceries"];
    const snapshot = [...ids];
    toggleCategoryId(ids, "dining");
    expect(ids).toEqual(snapshot);
  });
});

describe("nextCategoryPatch — accent pinning", () => {
  it("omits `color` when the jar already has an explicit color", () => {
    const jar: Jar = { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"], color: "#0e7490" };
    const patch = nextCategoryPatch(jar, ["dining", "groceries", "transport"]);
    expect(patch).toEqual({ categoryIds: ["dining", "groceries", "transport"] });
    expect(patch).not.toHaveProperty("color");
  });

  it("omits `color` when the jar has no color and the accent is unchanged (toggling a non-first category)", () => {
    const jar: Jar = { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"] };
    // "dining" stays first — jarAccent is unaffected by appending "transport".
    const patch = nextCategoryPatch(jar, ["dining", "groceries", "transport"]);
    expect(patch).toEqual({ categoryIds: ["dining", "groceries", "transport"] });
    expect(patch).not.toHaveProperty("color");
  });

  it("pins the PRE-toggle accent when removing the first category changes it", () => {
    const jar: Jar = { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"] };
    const patch = nextCategoryPatch(jar, ["groceries"]);
    expect(patch.categoryIds).toEqual(["groceries"]);
    expect(patch.color).toBe(categoryColor("dining"));
    // Sanity: the new first category really would have picked a different hue.
    expect(categoryColor("dining")).not.toBe(categoryColor("groceries"));
  });

  it("pins the PRE-toggle accent when reordering changes the first category", () => {
    const jar: Jar = { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"] };
    const patch = nextCategoryPatch(jar, ["groceries", "dining"]);
    expect(patch.color).toBe(categoryColor("dining"));
  });

  it("pins the last accent rather than falling back to the neutral color when the jar is emptied", () => {
    const jar: Jar = { id: "diet", label: "Ăn uống", categoryIds: ["dining"] };
    const patch = nextCategoryPatch(jar, []);
    expect(patch.categoryIds).toEqual([]);
    expect(patch.color).toBe(categoryColor("dining"));
    expect(patch.color).not.toBe(CATEGORY_COLOR_FALLBACK);
  });
});
