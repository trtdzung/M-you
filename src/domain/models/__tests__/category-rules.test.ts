import { describe, expect, it } from "vitest";
import { CATEGORIES, INCOME, REBALANCE_CATEGORY, UNCLASSIFIED } from "@/domain/models";
import {
  MAX_CATEGORY_LABEL,
  isReservedCategoryId,
  labelConflict,
  normalizeCategoryLabel,
  slugCategoryId,
  uniqueCategoryId,
} from "../category-rules";

/**
 * The pure write-door rules for a user-created category (plan
 * 260920-1019 Phase 02). These are what make a client-supplied id impossible
 * (ids come from the slug whitelist) and a duplicate Vietnamese label detectable
 * without merging two genuinely different words.
 */

describe("slugCategoryId", () => {
  it("strips Vietnamese diacritics and prefixes c_", () => {
    expect(slugCategoryId("Học phí")).toBe("c_hoc-phi");
    expect(slugCategoryId("Ăn uống ngoài")).toBe("c_an-uong-ngoai");
  });

  it("maps đ/Đ to d — NFD cannot, it is a distinct letter", () => {
    expect(slugCategoryId("Đồ dùng")).toBe("c_do-dung");
    expect(slugCategoryId("đầu tư")).toBe("c_dau-tu");
  });

  it("collapses punctuation and emoji into single dashes, trimmed", () => {
    expect(slugCategoryId("  Cà phê & bánh!!  ")).toBe("c_ca-phe-banh");
    expect(slugCategoryId("Quà 🎁 tặng")).toBe("c_qua-tang");
  });

  it("falls back to a base-36 stamp when the label has no sluggable characters", () => {
    expect(slugCategoryId("🎁🎉", 1_700_000_000_000)).toBe(`c_${(1_700_000_000_000).toString(36)}`);
    expect(slugCategoryId("学费", 42)).toBe("c_16");
  });

  it("never produces a reserved id (the c_ prefix makes it structural)", () => {
    for (const preset of CATEGORIES) {
      expect(isReservedCategoryId(slugCategoryId(preset.id))).toBe(false);
    }
    expect(isReservedCategoryId(slugCategoryId("Khác"))).toBe(false);
  });
});

describe("uniqueCategoryId", () => {
  it("suffixes -2, -3… on collision", () => {
    expect(uniqueCategoryId("c_hoc-phi", [])).toBe("c_hoc-phi");
    expect(uniqueCategoryId("c_hoc-phi", ["c_hoc-phi"])).toBe("c_hoc-phi-2");
    expect(uniqueCategoryId("c_hoc-phi", ["c_hoc-phi", "c_hoc-phi-2"])).toBe("c_hoc-phi-3");
  });
});

describe("isReservedCategoryId", () => {
  it.each([UNCLASSIFIED, INCOME, REBALANCE_CATEGORY, "pool", "khac"])("reserves the sentinel %s", (id) => {
    expect(isReservedCategoryId(id)).toBe(true);
  });

  it("reserves every bundled preset id", () => {
    for (const preset of CATEGORIES) expect(isReservedCategoryId(preset.id)).toBe(true);
  });

  it("never reserves a c_-prefixed id", () => {
    expect(isReservedCategoryId("c_khac")).toBe(false);
    expect(isReservedCategoryId("c_income")).toBe(false);
  });
});

describe("labelConflict", () => {
  it("folds case", () => {
    expect(labelConflict("học phí", ["Học phí"])).toBe(true);
    expect(labelConflict("HỌC PHÍ", ["Học phí"])).toBe(true);
  });

  it("folds NFD vs NFC of the same word", () => {
    const nfd = "Ăn uống".normalize("NFD");
    expect(labelConflict(nfd, ["Ăn uống"])).toBe(true);
  });

  it("does NOT merge diacritic-distinct Vietnamese words", () => {
    expect(labelConflict("An uống", ["Ăn uống"])).toBe(false);
    expect(labelConflict("Cưới", ["Cười"])).toBe(false);
  });

  it("is false against an empty or unrelated set", () => {
    expect(labelConflict("Học phí", [])).toBe(false);
    expect(labelConflict("Học phí", ["Ăn uống", "Di chuyển"])).toBe(false);
  });
});

describe("normalizeCategoryLabel", () => {
  it("trims and NFC-normalises before storing", () => {
    expect(normalizeCategoryLabel("  Học phí  ")).toBe("Học phí");
    expect(normalizeCategoryLabel("Ăn uống".normalize("NFD"))).toBe("Ăn uống".normalize("NFC"));
  });

  it.each(["", "   ", "\t\n"])("rejects the empty/whitespace label %j", (raw) => {
    expect(normalizeCategoryLabel(raw)).toBeNull();
  });

  it("rejects a label over the cap rather than truncating it", () => {
    expect(normalizeCategoryLabel("a".repeat(MAX_CATEGORY_LABEL))).toHaveLength(MAX_CATEGORY_LABEL);
    expect(normalizeCategoryLabel("a".repeat(MAX_CATEGORY_LABEL + 1))).toBeNull();
  });

  it.each([null, undefined, 42, {}, ["Học phí"]])("rejects the non-string label %j", (raw) => {
    expect(normalizeCategoryLabel(raw)).toBeNull();
  });
});
