/**
 * Formatting helpers for VND currency and relative dates (Vietnamese).
 * Keep pure and framework-agnostic so both UI and tests can use them.
 */

/** Sentinel used across the app for values that are not known. */
export const UNKNOWN = "unknown" as const;
export type MaybeAmount = number | typeof UNKNOWN | null | undefined;

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

/** Returns true when the value cannot be rendered as a real amount. */
export function isUnknownAmount(amount: MaybeAmount): boolean {
  return (
    amount === UNKNOWN ||
    amount === null ||
    amount === undefined ||
    (typeof amount === "number" && Number.isNaN(amount))
  );
}

/**
 * Format a number as VND, e.g. 1250000 -> "1.250.000 ₫".
 * Unknown values return the em dash placeholder.
 */
export function formatVnd(amount: MaybeAmount): string {
  if (isUnknownAmount(amount)) return "—";
  return `${vndFormatter.format(amount as number)} ₫`;
}

/** Compact VND for tight spaces, e.g. 1250000 -> "1,25 tr". */
export function formatVndCompact(amount: MaybeAmount): string {
  if (isUnknownAmount(amount)) return "—";
  const value = amount as number;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}${trim(abs / 1_000_000_000)} tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${trim(abs / 1_000_000)} tr`;
  }
  if (abs >= 1_000) {
    return `${sign}${trim(abs / 1_000)} ng`;
  }
  return `${sign}${vndFormatter.format(abs)} ₫`;
}

function trim(n: number): string {
  return n
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

/**
 * Short unit-suffixed VND for chart labels, matching the reference PFM style:
 * 5_500_000 -> "5,5 Tr", 500_000 -> "500 N", 28_200_000 -> "28,2 Tr",
 * -5_000_000 -> "-5 Tr". Unknown values return "—".
 */
export function formatVndUnit(amount: MaybeAmount): string {
  if (isUnknownAmount(amount)) return "—";
  const value = amount as number;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} Tỷ`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} Tr`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)} N`;
  return `${sign}${vndFormatter.format(abs)} ₫`;
}

/**
 * Mask an account number for display, keeping only the last 4 digits behind
 * bullet dots, e.g. "668812081991" -> "•••• 1991". Non-digits are stripped;
 * a number shorter than 4 digits is shown in full behind the dots.
 */
export function maskAccountNumber(accountNumber: string): string {
  const digits = (accountNumber ?? "").replace(/\D/g, "");
  if (!digits) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

/** Format a date as "dd/MM/yyyy" in Vietnamese locale. */
export function formatDate(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Relative date in Vietnamese, e.g. "Hôm nay", "Hôm qua", "3 ngày trước".
 * Falls back to an absolute date beyond ~30 days.
 */
export function formatRelativeDate(
  date: Date | string | number,
  now: Date = new Date(),
): string {
  const d = toDate(date);
  if (!d) return "—";
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.round((startOf(now) - startOf(d)) / dayMs);

  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  if (diffDays === -1) return "Ngày mai";
  if (diffDays > 1 && diffDays <= 30) return `${diffDays} ngày trước`;
  if (diffDays < -1 && diffDays >= -30) return `${Math.abs(diffDays)} ngày nữa`;
  return formatDate(d);
}

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
