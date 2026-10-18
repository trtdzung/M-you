import { describe, expect, it } from "vitest";
import { addMonthsToDate, monthsLeft } from "../months";

const NOW = new Date("2026-09-15T00:00:00.000Z");

describe("monthsLeft", () => {
  it("returns 1 when the target falls in the same month", () => {
    expect(monthsLeft(NOW, "2026-09-15")).toBe(1);
    expect(monthsLeft(NOW, "2026-09-30")).toBe(1);
  });

  it("counts calendar months across years", () => {
    expect(monthsLeft(NOW, "2027-09-15")).toBe(12);
    expect(monthsLeft(NOW, "2027-01-01")).toBe(4);
    expect(monthsLeft(NOW, "2029-09-01")).toBe(36);
  });

  it("never returns less than 1, including a past target", () => {
    expect(monthsLeft(NOW, "2026-08-31")).toBe(1);
    expect(monthsLeft(NOW, "2020-01-01")).toBe(1);
    expect(monthsLeft(NOW, "2025-12-31")).toBe(1);
  });
});

describe("monthsLeft near the Vietnam month boundary", () => {
  it("uses the Vietnam (UTC+7) month, not the UTC month", () => {
    // 2026-08-31T20:00Z is already 1 Sep 03:00 in Vietnam.
    const lateAugustUtc = new Date("2026-08-31T20:00:00.000Z");
    expect(monthsLeft(lateAugustUtc, "2026-10-15")).toBe(1);
    expect(monthsLeft(lateAugustUtc, "2026-12-15")).toBe(3);
  });
});

describe("addMonthsToDate", () => {
  it("clamps 31 Jan to 28 Feb in a non-leap year", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("clamps 31 Jan to 29 Feb in leap year 2028", () => {
    expect(addMonthsToDate("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("rolls into the next year", () => {
    expect(addMonthsToDate("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsToDate("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("returns the same date when n is 0", () => {
    expect(addMonthsToDate("2026-09-15", 0)).toBe("2026-09-15");
  });

  it("clamps a 31st onto a 30-day month", () => {
    expect(addMonthsToDate("2026-08-31", 1)).toBe("2026-09-30");
  });
});
