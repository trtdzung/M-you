import { describe, expect, it } from "vitest";
import type { ToolResult } from "@/ai/tools/types";
import { allowedNumbers, validateNumeric, validateSafety } from "../validator";

const results: ToolResult[] = [
  { data: { income: 25_000_000, expense: 18_400_000, net: 6_600_000 }, sources: ["x"] },
  { data: { categories: [{ amount: 4_200_000, sharePct: 23 }] }, sources: ["y"] },
];

describe("validateNumeric (grounding guard)", () => {
  it("collects every number from tool results", () => {
    const set = allowedNumbers(results);
    expect(set.has(25_000_000)).toBe(true);
    expect(set.has(4_200_000)).toBe(true);
  });

  it("passes when every amount traces to a tool result", () => {
    const text = "Thu nhập của bạn là 25.000.000 ₫, chi tiêu 18.400.000 ₫.";
    expect(validateNumeric(text, results).ok).toBe(true);
  });

  it("tolerates rounded figures within 2%", () => {
    const text = "Bạn chi khoảng 4.200.000 ₫ cho ăn uống (23%).";
    expect(validateNumeric(text, results).ok).toBe(true);
  });

  it("rejects a fabricated amount not present in any tool result", () => {
    const text = "Số dư tiết kiệm của bạn là 987.654.321 ₫.";
    const v = validateNumeric(text, results);
    expect(v.ok).toBe(false);
    expect(v.ungrounded).toContain(987_654_321);
  });

  it("ignores small numbers (percentages, counts, months)", () => {
    const text = "Bạn tiết kiệm 23% và đạt mục tiêu sau 6 tháng.";
    expect(validateNumeric(text, results).ok).toBe(true);
  });

  it("does NOT flag a year in a period label (regression: prompt requires the period)", () => {
    const text = "Trong tháng 9/2026, thu nhập của bạn là 25.000.000 ₫.";
    expect(validateNumeric(text, results).ok).toBe(true);
  });

  it("rejects a figure materially off a rounded bucket (no tolerance stacking)", () => {
    // net = 6,600,000; a value near the nearest-million bucket (7,000,000) must NOT pass.
    expect(validateNumeric("Dòng tiền ròng của bạn là 6.860.000 ₫.", results).ok).toBe(false);
  });

  it("accepts a sensibly rounded form of a real figure", () => {
    expect(validateNumeric("Bạn kiếm khoảng 25.000.000 ₫.", results).ok).toBe(true);
    // 4,200,000 rounded to 2 sig figs stays 4,200,000; nearest-million is 4,000,000.
    expect(validateNumeric("Bạn chi khoảng 4.000.000 ₫ cho ăn uống.", results).ok).toBe(true);
  });
});

describe("validateSafety", () => {
  it("blocks guaranteed-return language", () => {
    expect(validateSafety("Sản phẩm này đảm bảo lợi nhuận 20%.").ok).toBe(false);
    expect(validateSafety("Chắc chắn sinh lời, không bao giờ lỗ.").ok).toBe(false);
  });

  it("blocks false claims that a transaction was performed", () => {
    expect(validateSafety("Mình đã chuyển 5.000.000 ₫ cho bạn.").ok).toBe(false);
    expect(validateSafety("Giao dịch chuyển khoản đã thành công.").ok).toBe(false);
    expect(validateSafety("Đã chuyển tiền theo yêu cầu của bạn.").ok).toBe(false);
  });

  it("allows ordinary explanations", () => {
    expect(validateSafety("Lãi suất tham khảo khoảng 5,6%/năm.").ok).toBe(true);
    expect(validateSafety("Tháng này bạn đã chi 4.200.000 ₫ cho ăn uống.").ok).toBe(true);
  });
});
