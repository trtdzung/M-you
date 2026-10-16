/**
 * Strict parser for the jar "Hạn mức/tháng" field (U19/S13/L04–L06). Accepts only
 * a whole-VND amount written as plain digits or grouped by ONE consistent
 * thousands separator — "." (the hint's own `formatVnd` format), "," or a space —
 * with an optional trailing "₫"/"đ". Everything `Number()` would otherwise
 * smuggle in is rejected: "1e5", "0x10", "+5", "-5", "0.4", "1.2.3", mixed
 * separators. Values above `Number.MAX_SAFE_INTEGER` are rejected instead of
 * silently losing precision. Blank means "chưa đặt" (clear the limit — unknown,
 * never 0, invariant #6).
 */

export type VndInputResult =
  | { kind: "empty" }
  | { kind: "ok"; value: number }
  | { kind: "error"; message: string };

export const VND_INPUT_FORMAT_ERROR = "Chỉ nhập số tiền, vd 5.000.000";
export const VND_INPUT_NEGATIVE_ERROR = "Không được âm";
export const VND_INPUT_TOO_LARGE_ERROR = "Số tiền quá lớn";

/** Plain digits, or 1–3 digits then groups of exactly 3 joined by the SAME separator. */
const VND_PATTERN = /^(?:\d+|\d{1,3}([., ])\d{3}(?:\1\d{3})*)$/;

export function parseVndInput(raw: string): VndInputResult {
  // Normalize the non-breaking/narrow spaces `Intl` emits, then drop a currency suffix.
  const text = raw
    .replace(/[  ]/g, " ")
    .trim()
    .replace(/\s*[₫đ]$/i, "")
    .trim();
  if (text === "") return { kind: "empty" };
  if (text.startsWith("-")) return { kind: "error", message: VND_INPUT_NEGATIVE_ERROR };
  if (!VND_PATTERN.test(text)) return { kind: "error", message: VND_INPUT_FORMAT_ERROR };
  const digits = text.replace(/[., ]/g, "");
  // Compare as a digit string BEFORE Number(): a 20-digit value would already be rounded.
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  const max = String(Number.MAX_SAFE_INTEGER);
  if (trimmed.length > max.length || (trimmed.length === max.length && trimmed > max)) {
    return { kind: "error", message: VND_INPUT_TOO_LARGE_ERROR };
  }
  return { kind: "ok", value: Number(trimmed) };
}
