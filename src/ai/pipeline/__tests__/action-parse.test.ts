import { describe, expect, it } from "vitest";
import { parseAction } from "../action-parse";

describe("action-parse — deterministic field extraction", () => {
  it("parses '5tr' / '5 triệu' shorthand into VND", () => {
    expect(parseAction("Chuyển 5tr cho Lan").amount).toBe(5_000_000);
    expect(parseAction("Chuyển 5 triệu cho Lan").amount).toBe(5_000_000);
    expect(parseAction("Chuyển 5,5tr cho Lan").amount).toBe(5_500_000);
  });

  it("parses dot-grouped thousands and unit-suffixed amounts", () => {
    expect(parseAction("Chuyển cho Lan 5.000.000").amount).toBe(5_000_000);
    expect(parseAction("Chuyển 5000000 đ cho Lan").amount).toBe(5_000_000);
  });

  it("does NOT read a typed account number as the amount", () => {
    // Account is introduced by 'cho'; the real amount follows it. The grouped
    // account digits must not be picked up as the amount (~25x error otherwise).
    const parsed = parseAction("Chuyển cho 123.456.789 5.000.000");
    expect(parsed.recipientHint).toBe("123456789");
    expect(parsed.amount).toBe(5_000_000);
  });

  it("account number after 'STK' is the recipient, not the amount", () => {
    const parsed = parseAction("Chuyển 2tr tới STK 19012345678901");
    expect(parsed.recipientHint).toBe("19012345678901");
    expect(parsed.amount).toBe(2_000_000);
  });

  it("flags urgency language", () => {
    expect(parseAction("Chuyển 6 triệu cho Hà gấp").urgency).toBe(true);
    expect(parseAction("Chuyển 6 triệu cho Hà").urgency).toBe(false);
  });
});
