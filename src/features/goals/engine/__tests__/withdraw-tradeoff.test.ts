import { describe, expect, it } from "vitest";
import { withdrawTradeoff } from "../withdraw-tradeoff";

describe("withdrawTradeoff", () => {
  it("converts 5_000_000 at a monthly pace of 3_100_000 into 7 weeks", () => {
    expect(withdrawTradeoff({ amount: 5_000_000, monthlyPace: 3_100_000 })).toEqual({
      weeks: 7,
      amount: 5_000_000,
    });
  });

  it("returns unknown weeks when the pace is null, zero, or negative", () => {
    for (const monthlyPace of [null, 0, -1]) {
      expect(withdrawTradeoff({ amount: 5_000_000, monthlyPace })).toEqual({
        weeks: "unknown",
        amount: 5_000_000,
      });
    }
  });
});
