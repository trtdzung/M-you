import { isUnknownAmount, type MaybeAmount } from "@/lib/format";

const exact = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export function formatVnd(amount: MaybeAmount): string {
  return isUnknownAmount(amount) ? "—" : `${exact.format(amount as number)} đồng`;
}

/** Readable units for summaries; exact amounts remain available in details. */
export function formatVndCompact(amount: MaybeAmount): string {
  if (isUnknownAmount(amount)) return "—";
  const value = amount as number;
  if (Math.abs(value) >= 1_000_000_000) return `${compact.format(value / 1_000_000_000)} tỷ đồng`;
  if (Math.abs(value) >= 1_000_000) return `${compact.format(value / 1_000_000)} triệu đồng`;
  return formatVnd(value);
}
