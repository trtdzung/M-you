import { describe, expect, it, vi } from "vitest";
import {
  CATEGORY_COLOR_FALLBACK,
  JAR_COLOR_OPTIONS,
  categoryColor,
  jarAccent,
} from "../category-colors";

/**
 * Hợp đồng màu danh mục (RT#8): một danh mục phải giữ NGUYÊN màu qua mọi kỳ, mọi
 * bộ lọc hũ, mọi biểu đồ. Màu preset gán theo vị trí cố định trong taxonomy chi,
 * nên bảng dưới đây được viết bằng hex NGUYÊN VĂN, không dẫn xuất từ `PALETTE`.
 * Nếu ai đó đổi thứ tự taxonomy hay chèn danh mục preset mới vào giữa, test này
 * phải đỏ — đó chính là mục đích của nó.
 */
const PRESET_HEX: Record<string, string> = {
  housing: "#f26522",
  utilities: "#e8654e",
  subscriptions: "#f2a24a",
  insurance: "#d98324",
  dining: "#a8562a",
  transport: "#0e7490",
  shopping: "#3f6d8e",
  groceries: "#6b4e71",
  // 10 danh mục chi trên 8 màu → hai màu cuối quay vòng về slot 0 và 1.
  entertainment: "#f26522",
  health: "#e8654e",
};

/** Sentinel + id nhóm: luôn là xám trung tính, không bao giờ băm ra màu. */
const NEUTRAL_IDS = ["unclassified", "income", "dieu-chinh-hu", "khac"];

describe("categoryColor — preset stability (RT#8)", () => {
  it.each(Object.entries(PRESET_HEX))("%s giữ đúng màu %s", (id, hex) => {
    expect(categoryColor(id)).toBe(hex);
  });

  it("phủ hết 10 danh mục chi của taxonomy", async () => {
    const { CATEGORIES } = await import("@/domain/models");
    const expenseIds = CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.id);
    expect(expenseIds.sort()).toEqual(Object.keys(PRESET_HEX).sort());
  });
});

describe("categoryColor — sentinel và id nhóm", () => {
  it.each(NEUTRAL_IDS)("%s trả về màu trung tính", (id) => {
    expect(categoryColor(id)).toBe(CATEGORY_COLOR_FALLBACK);
  });

  it("chuỗi rỗng trả về màu trung tính", () => {
    expect(categoryColor("")).toBe(CATEGORY_COLOR_FALLBACK);
  });
});

describe("categoryColor — danh mục tuỳ chỉnh", () => {
  const customIds = ["c_hoc-phi", "c_tien-hoc-them", "c_quy-den-on", "c_x"];

  it("cùng một id luôn ra cùng một màu trong một lần chạy", () => {
    for (const id of customIds) {
      expect(categoryColor(id)).toBe(categoryColor(id));
    }
  });

  it("màu ổn định qua lần import lại module (không phụ thuộc random/thời điểm)", async () => {
    const before = customIds.map((id) => categoryColor(id));
    vi.resetModules();
    const fresh = await import("../category-colors");
    expect(customIds.map((id) => fresh.categoryColor(id))).toEqual(before);
  });

  it("không bao giờ trùng màu với dải preset — người dùng phân biệt được custom", () => {
    for (const id of customIds) {
      expect(JAR_COLOR_OPTIONS).not.toContain(categoryColor(id));
    }
  });

  it("không trả về màu trung tính (đó là phần dành cho sentinel)", () => {
    for (const id of customIds) {
      expect(categoryColor(id)).not.toBe(CATEGORY_COLOR_FALLBACK);
    }
  });

  it("id khác nhau thì màu phân tán, không dồn hết vào một màu", () => {
    const many = Array.from({ length: 24 }, (_, i) => `c_muc-${i}`);
    const hues = new Set(many.map((id) => categoryColor(id)));
    expect(hues.size).toBeGreaterThan(1);
  });
});

describe("jarAccent", () => {
  it("hũ đã tự chọn màu thì giữ nguyên màu đó", () => {
    expect(jarAccent({ color: "#123456", categoryIds: ["housing"] })).toBe("#123456");
  });

  it("hũ chưa chọn màu lấy màu của danh mục đầu tiên (preset)", () => {
    expect(jarAccent({ categoryIds: ["dining", "groceries"] })).toBe(PRESET_HEX.dining);
  });

  it("hũ chưa chọn màu có danh mục đầu là custom thì lấy màu băm của id đó", () => {
    expect(jarAccent({ categoryIds: ["c_hoc-phi"] })).toBe(categoryColor("c_hoc-phi"));
  });

  it("hũ không có danh mục nào trả về màu trung tính", () => {
    expect(jarAccent({ categoryIds: [] })).toBe(CATEGORY_COLOR_FALLBACK);
  });
});
