import { describe, expect, it } from "vitest";
import { seriesPriceAt } from "../value";

describe("F8 seriesPriceAt", () => {
  it("lấy điểm cuối ≤ ngày, không nội suy; trước điểm đầu → giá điểm đầu", () => {
    const series = [
      { date: "2026-10-16", price: 100 },
      { date: "2026-10-19", price: 130 },
    ];
    expect(seriesPriceAt(series, "2026-10-17")).toBe(100);
    expect(seriesPriceAt(series, "2026-10-16")).toBe(100);
    expect(seriesPriceAt(series, "2026-10-19")).toBe(130);
    expect(seriesPriceAt(series, "2026-10-15")).toBe(100);
    expect(seriesPriceAt(series, "2026-10-20")).toBe(130);
    expect(seriesPriceAt([], "2026-10-17")).toBe(0);
  });

  it("áp shiftPct sau khi chọn điểm", () => {
    const series = [{ date: "2026-01-01", price: 200 }];
    expect(seriesPriceAt(series, "2026-06-01", 10)).toBe(220);
  });
});
