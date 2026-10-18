import { describe, expect, it } from "vitest";
import { DAY_MS, formatPendingAt, isPending, withoutPending, type PendingOff } from "../pending";

describe("pending helpers", () => {
  it("defines DAY_MS as 24 hours in milliseconds", () => {
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  describe("isPending", () => {
    const now = 1_000_000;

    it("returns true when target time is strictly in the future", () => {
      expect(isPending(now + 1, now)).toBe(true);
      expect(isPending(now + DAY_MS, now)).toBe(true);
    });

    it("returns false when target time has passed, is equal to now, or is undefined", () => {
      expect(isPending(now, now)).toBe(false);
      expect(isPending(now - 1, now)).toBe(false);
      expect(isPending(undefined, now)).toBe(false);
    });
  });

  describe("formatPendingAt", () => {
    it("formats timestamp as 'HH:mm dd/MM'", () => {
      // 2026-10-15T08:30:00+07:00 (VN time)
      const date = new Date("2026-10-15T01:30:00.000Z");
      const formatted = formatPendingAt(date.getTime());
      expect(formatted).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}$/);
      expect(formatted).toContain("15/10");
    });
  });

  describe("withoutPending", () => {
    it("returns a new object with the specified pending key removed", () => {
      const original: PendingOff = {
        aiProtect: 123456,
        transferLock: 789012,
        antiPhishing: 345678,
      };

      const result = withoutPending(original, "transferLock");
      expect(result).toEqual({
        aiProtect: 123456,
        antiPhishing: 345678,
      });
      // original remains unchanged
      expect(original.transferLock).toBe(789012);
    });
  });
});
