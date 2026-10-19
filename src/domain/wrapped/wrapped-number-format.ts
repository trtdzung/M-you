/** Non-money value formatting for Wrapped copy (percent, count, month, weekday). Pure. */

/** Shown for any unknown value (amount, percent, count). Lives here so money-format can import this module without a cycle. */
export const UNKNOWN_TEXT = "Chưa rõ";

const countFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** Percent on the 0-100 scale; never rounds a non-zero share to 0% or a partial one to 100%. */
export function formatWrappedPct(value: number | "unknown" | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return UNKNOWN_TEXT;
  if (value > 0 && value < 1) return "<1%";
  const rounded = Math.round(value);
  return `${value < 100 && rounded >= 100 ? 99 : rounded}%`;
}

/** Hero digits with a vi decimal comma and a fixed number of places ("73,85"). Thousands are not grouped. */
export function heroDigits(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(".", ",");
}

export function formatWrappedCount(value: number): string {
  return countFormatter.format(value);
}

// One month-label implementation for the app and Wrapped ("2026-07" -> "Tháng 7/2026").
export { monthKeyLabel } from "@/lib/demo-clock";

const WEEKDAY_NAMES = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"] as const;

/** VN weekday index (0 = Chủ nhật .. 6 = Thứ bảy) -> name, or null when out of range. */
export function weekdayName(day: number): string | null {
  return Number.isInteger(day) ? (WEEKDAY_NAMES[day] ?? null) : null;
}
