import { describe, expect, it } from "vitest";
import { averageSurplus, type MonthCashflow } from "../surplus";

function month(
  monthKey: string,
  income: number,
  expense: number,
  txnCount: number,
): MonthCashflow {
  return { monthKey, income, expense, txnCount };
}

describe("averageSurplus", () => {
  it("averages three usable months and rounds to the nearest integer", () => {
    const result = averageSurplus([
      month("2026-06", 10, 0, 1),
      month("2026-07", 11, 0, 2),
      month("2026-08", 0, 0, 4),
    ]);
    expect(result).toEqual({ value: 7, monthsUsed: 3 });
  });

  it("skips a month with txnCount 0 and rounds the remaining mean", () => {
    const result = averageSurplus([
      month("2026-06", 100, 40, 1),
      month("2026-07", 999, 1, 0),
      month("2026-08", 80, 10, 3),
      month("2026-05", 50, 20, 2),
    ]);
    // (60 + 70 + 30) / 3 = 53.333… → 53. Tháng txnCount 0 không vào mẫu số.
    expect(result).toEqual({ value: 53, monthsUsed: 3 });
  });

  it("returns unknown when every month is empty or there are no months", () => {
    expect(averageSurplus([])).toEqual({ value: "unknown", monthsUsed: 0 });
    expect(
      averageSurplus([
        month("2026-06", 5_000_000, 1_000_000, 0),
        month("2026-07", 1, 1, 0),
      ]),
    ).toEqual({ value: "unknown", monthsUsed: 0 });
  });

  it("keeps a negative surplus, including a half that rounds toward positive infinity", () => {
    expect(averageSurplus([month("2026-06", 100, 250, 1)])).toEqual({
      value: -150,
      monthsUsed: 1,
    });
    // -3 / 2 = -1.5 → Math.round = -1. Dấu âm được giữ.
    expect(
      averageSurplus([
        month("2026-06", 0, 1, 1),
        month("2026-07", 0, 2, 1),
        month("2026-08", 9_000, 1, 0),
      ]),
    ).toEqual({ value: -1, monthsUsed: 2 });
  });
});
