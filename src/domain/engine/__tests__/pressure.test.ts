import { describe, expect, it } from "vitest";
import { daysLeftIn, statusOf, NEAR_THRESHOLD } from "../pressure";
import { monthPeriod } from "../types";

const JUNE = monthPeriod(2026, 5);

describe("statusOf", () => {
  it("treats non-positive limits as ok", () => {
    expect(statusOf(500, 0)).toBe("ok");
    expect(statusOf(500, -100)).toBe("ok");
  });

  it("classifies at the near threshold and above", () => {
    expect(statusOf(NEAR_THRESHOLD * 1000, 1000)).toBe("near"); // exactly 0.8 -> near
    expect(statusOf(790, 1000)).toBe("ok");
    expect(statusOf(1000, 1000)).toBe("near"); // at limit, not over
    expect(statusOf(1001, 1000)).toBe("over");
  });
});

describe("daysLeftIn", () => {
  it("counts whole days remaining and clamps past periods to 0", () => {
    expect(daysLeftIn(JUNE, new Date("2026-06-20T00:00:00.000Z"))).toBe(11);
    expect(daysLeftIn(JUNE, new Date("2026-07-05T00:00:00.000Z"))).toBe(0);
  });
});
