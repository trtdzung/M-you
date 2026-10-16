import { describe, expect, it } from "vitest";
import {
  normalizeLabel,
  findDuplicateLabels,
  duplicateLabelIds,
  isDuplicateLabel,
} from "../category-dedupe";

describe("normalizeLabel", () => {
  it("folds case, accents, đ and whitespace", () => {
    expect(normalizeLabel("  Ăn   Uống ")).toBe("an uong");
    expect(normalizeLabel("Đầu tư")).toBe("dau tu");
    expect(normalizeLabel("ĂN UỐNG")).toBe(normalizeLabel("ăn uống"));
  });
});

describe("findDuplicateLabels", () => {
  it("groups only real collisions, in input order", () => {
    const groups = findDuplicateLabels([
      { id: "a", label: "Ăn uống" },
      { id: "b", label: "Di chuyển" },
      { id: "c", label: "ăn uống" },
    ]);
    expect(groups).toEqual([{ key: "an uong", ids: ["a", "c"] }]);
  });

  it("ignores empty labels and returns [] with no collisions", () => {
    expect(findDuplicateLabels([{ id: "a", label: "  " }, { id: "b", label: "X" }])).toEqual([]);
  });
});

describe("duplicateLabelIds", () => {
  it("returns every id that shares a label", () => {
    const ids = duplicateLabelIds([
      { id: "a", label: "Nhà" },
      { id: "b", label: "nhà" },
      { id: "c", label: "Xe" },
    ]);
    expect(ids).toEqual(new Set(["a", "b"]));
  });
});

describe("isDuplicateLabel", () => {
  const existing = [{ id: "a", label: "Ăn uống" }, { id: "b", label: "Di chuyển" }];

  it("blocks a colliding new label", () => {
    expect(isDuplicateLabel("an uong", existing)).toBe(true);
  });

  it("allows a unique label", () => {
    expect(isDuplicateLabel("Giải trí", existing)).toBe(false);
  });

  it("ignores the item being renamed (exceptId)", () => {
    expect(isDuplicateLabel("Ăn uống", existing, "a")).toBe(false);
  });
});
