import { describe, it, expect } from "vitest";
import {
  formatVnd,
  formatVndCompact,
  formatRelativeDate,
  isUnknownAmount,
  maskAccountNumber,
  UNKNOWN,
} from "./format";

describe("maskAccountNumber", () => {
  it("keeps only the last 4 digits behind bullets", () => {
    expect(maskAccountNumber("668812081991")).toBe("•••• 1991");
    expect(maskAccountNumber("031010112345678")).toBe("•••• 5678");
  });
  it("strips non-digits before masking", () => {
    expect(maskAccountNumber("0071-0009-9887-7")).toBe("•••• 8877");
  });
  it("handles empty input", () => {
    expect(maskAccountNumber("")).toBe("••••");
  });
});

describe("formatVnd", () => {
  it("formats a number as VND", () => {
    expect(formatVnd(1_250_000)).toBe("1.250.000 ₫");
  });
  it("renders unknown values as em dash", () => {
    expect(formatVnd(UNKNOWN)).toBe("—");
    expect(formatVnd(null)).toBe("—");
    expect(formatVnd(undefined)).toBe("—");
  });
});

describe("isUnknownAmount", () => {
  it("detects unknowns", () => {
    expect(isUnknownAmount(UNKNOWN)).toBe(true);
    expect(isUnknownAmount(NaN)).toBe(true);
    expect(isUnknownAmount(0)).toBe(false);
  });
});

describe("formatVndCompact", () => {
  it("compacts millions and billions", () => {
    expect(formatVndCompact(1_250_000)).toBe("1,25 tr");
    expect(formatVndCompact(2_000_000_000)).toBe("2 tỷ");
  });
});

describe("formatRelativeDate", () => {
  const now = new Date(2026, 8, 3);
  it("labels today and yesterday", () => {
    expect(formatRelativeDate(new Date(2026, 8, 3), now)).toBe("Hôm nay");
    expect(formatRelativeDate(new Date(2026, 8, 2), now)).toBe("Hôm qua");
    expect(formatRelativeDate(new Date(2026, 8, 1), now)).toBe("2 ngày trước");
  });
});
