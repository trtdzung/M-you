/**
 * VN business time (fixed UTC+7) for month keys/periods, and instant-based
 * `inPeriod` (D16/J05/S11/U21, J06). Deterministic — no wall clock.
 */
import { describe, expect, it } from "vitest";
import { FIXED_CATEGORY_IDS } from "@/domain/models";
import { aggregateCashflow, inPeriod } from "../cashflow";
import { addMonthsToKey, dateToMonthKey, isoInPeriod, monthPeriod, monthPeriodFromKey, parseMonthKey } from "../types";
import { txn } from "./helpers";

describe("monthPeriod — VN calendar month with UTC ISO bounds", () => {
  it("September 2026 = 01/09 00:00 +07:00 … 30/09 23:59:59.999 +07:00", () => {
    const p = monthPeriod(2026, 8);
    expect(p.from).toBe("2026-08-31T17:00:00.000Z");
    expect(p.to).toBe("2026-09-30T16:59:59.999Z");
    expect(p.label).toBe("09/2026");
  });

  it("year rollover and a non-leap February", () => {
    expect(monthPeriod(2026, 0).from).toBe("2025-12-31T17:00:00.000Z");
    expect(monthPeriod(2026, 1).to).toBe("2026-02-28T16:59:59.999Z");
    expect(monthPeriodFromKey("2025-12").to).toBe("2025-12-31T16:59:59.999Z");
  });

  it("consecutive months tile with no gap/overlap (to + 1ms = next from)", () => {
    for (let m = 0; m < 12; m++) {
      const cur = monthPeriod(2026, m);
      const next = monthPeriod(2026, m + 1);
      expect(Date.parse(cur.to) + 1).toBe(Date.parse(next.from));
    }
  });
});

describe("dateToMonthKey — VN month of an instant", () => {
  it("00:30 01/10/2026 +07:00 (= 30/09 17:30Z) is October (U21/S11)", () => {
    expect(dateToMonthKey(new Date("2026-10-01T00:30:00+07:00"))).toBe("2026-10");
    expect(dateToMonthKey(new Date("2026-09-30T17:30:00.000Z"))).toBe("2026-10");
  });

  it("23:59 30/09 VN (= 16:59Z) is still September", () => {
    expect(dateToMonthKey(new Date("2026-09-30T16:59:59.999Z"))).toBe("2026-09");
  });

  it("invalid date → fallback's month; no valid fallback → descriptive RangeError (never 'NaN-NaN')", () => {
    const fallback = new Date("2026-09-15T00:00:00.000Z");
    expect(dateToMonthKey(new Date("abc"), fallback)).toBe("2026-09");
    expect(() => dateToMonthKey(new Date("abc"))).toThrow(RangeError);
  });
});

describe("month key parsing", () => {
  it("parseMonthKey rejects malformed keys", () => {
    expect(parseMonthKey("2026-09")).toEqual({ year: 2026, month0: 8 });
    for (const bad of ["NaN-NaN", "2026-13", "2026-00", "2026-9", "", "abc"]) expect(parseMonthKey(bad)).toBeNull();
  });

  it("monthPeriodFromKey on a malformed key throws a descriptive RangeError, not 'Invalid time value'", () => {
    expect(() => monthPeriodFromKey("NaN-NaN")).toThrow(/Invalid month key/);
  });

  it("addMonthsToKey is pure key arithmetic across years", () => {
    expect(addMonthsToKey("2025-12", 1)).toBe("2026-01");
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
    expect(addMonthsToKey("2026-09", -12)).toBe("2025-09");
  });
});

describe("inPeriod compares real instants (D16/J05)", () => {
  const SEP = monthPeriodFromKey("2026-09");
  const AUG = monthPeriodFromKey("2026-08");

  it("an offset-suffixed timestamp lands in its true VN month", () => {
    // 01/09 00:30 VN is September in VN business time.
    const t = txn({ postedAt: "2026-09-01T00:30:00+07:00" });
    expect(inPeriod(t, SEP)).toBe(true);
    expect(inPeriod(t, AUG)).toBe(false);
  });

  it("31/08 23:30 VN written as +07:00 is August (not lexically September)", () => {
    const t = txn({ postedAt: "2026-08-31T23:30:00+07:00" });
    expect(inPeriod(t, AUG)).toBe(true);
    expect(inPeriod(t, SEP)).toBe(false);
  });

  it("inclusive bounds on the exact first/last millisecond", () => {
    expect(isoInPeriod(SEP.from, SEP)).toBe(true);
    expect(isoInPeriod(SEP.to, SEP)).toBe(true);
    expect(isoInPeriod(new Date(Date.parse(SEP.to) + 1).toISOString(), SEP)).toBe(false);
  });

  it("an unparseable postedAt is in no period (no throw)", () => {
    expect(isoInPeriod("abc", SEP)).toBe(false);
  });

  it("cash flow counts a midnight-VN txn in the right month", () => {
    const t = txn({ postedAt: "2026-09-30T17:30:00.000Z", amount: 50_000 }); // 01/10 00:30 VN
    expect(aggregateCashflow([t], SEP, FIXED_CATEGORY_IDS).expense).toBe(0);
    expect(aggregateCashflow([t], monthPeriodFromKey("2026-10"), FIXED_CATEGORY_IDS).expense).toBe(50_000);
  });
});
