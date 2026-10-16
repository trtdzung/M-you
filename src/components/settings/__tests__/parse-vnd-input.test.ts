import { describe, expect, it } from "vitest";
import {
  parseVndInput,
  VND_INPUT_FORMAT_ERROR,
  VND_INPUT_NEGATIVE_ERROR,
  VND_INPUT_TOO_LARGE_ERROR,
} from "../parse-vnd-input";

describe("parseVndInput (U19/S13/L04–L06)", () => {
  it.each([
    ["5000000", 5_000_000],
    ["5.000.000", 5_000_000], // the hint's own formatVnd format
    ["5,000,000", 5_000_000],
    ["5 000 000", 5_000_000],
    ["5 000 000 ₫", 5_000_000], // pasted Intl output
    ["  900.000đ ", 900_000],
    ["0", 0],
    ["007", 7],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])("accepts %j → %d", (raw, value) => {
    expect(parseVndInput(raw)).toEqual({ kind: "ok", value });
  });

  it.each(["", "   ", "₫"])("treats %j as a cleared limit (chưa đặt)", (raw) => {
    expect(parseVndInput(raw)).toEqual({ kind: "empty" });
  });

  it.each(["1e5", "0x10", "+5", "0.4", "1.2.3", "5.000,000", "5.00.000", "12.34", "abc", "5tr", "Infinity", "NaN"])(
    "rejects %j (no Number() coercion)",
    (raw) => {
      expect(parseVndInput(raw)).toEqual({ kind: "error", message: VND_INPUT_FORMAT_ERROR });
    },
  );

  it("rejects a negative amount with its own message", () => {
    expect(parseVndInput("-5")).toEqual({ kind: "error", message: VND_INPUT_NEGATIVE_ERROR });
  });

  it("rejects values beyond MAX_SAFE_INTEGER instead of losing precision", () => {
    expect(parseVndInput("12345678901234567890")).toEqual({ kind: "error", message: VND_INPUT_TOO_LARGE_ERROR });
    expect(parseVndInput("9007199254740992")).toEqual({ kind: "error", message: VND_INPUT_TOO_LARGE_ERROR });
    expect(parseVndInput("9.007.199.254.740.992")).toEqual({ kind: "error", message: VND_INPUT_TOO_LARGE_ERROR });
  });
});
