import { describe, expect, it } from "vitest";
import { formatVnd, formatVndCompact } from "../format-money";

describe("readable money labels", () => {
  it.each([
    [294_000_000, "294 triệu đồng"],
    [1_500_000_000, "1,5 tỷ đồng"],
    [500_000, "500.000 đồng"],
    [-294_000_000, "-294 triệu đồng"],
    [0, "0 đồng"],
    ["unknown", "—"],
  ] as const)("formats %s with complete currency units", (value, expected) => {
    expect(formatVndCompact(value)).toBe(expected);
  });
  it("retains exact amounts in details", () => {
    expect(formatVnd(107_338_659)).toBe("107.338.659 đồng");
  });
});
