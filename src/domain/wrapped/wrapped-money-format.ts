/**
 * The ONE money formatter for Wrapped (decision D1): one mask decision, two output
 * shapes. Amounts are visible by default; `masked` swaps every digit for a fixed
 * mask. `formatWrappedMoney` (a sentence-sized string) and `wrappedHeroMoney` (the
 * giant compact number) BOTH route through `maskMoney`, so the unknown / masked
 * rules cannot drift apart. Copy functions build title, body, footnote AND
 * screen-reader text from these, so a masked amount can never leak through an
 * aria-label or live region.
 * An unknown amount reads "Chưa rõ" (or has no hero) whatever the mask — never "0 VND" (#6).
 */

import { formatVnd, isUnknownAmount, type MaybeAmount } from "@/lib/format";
import { heroDigits, UNKNOWN_TEXT } from "./wrapped-number-format";
import type { WrappedHero } from "./wrapped-copy-helpers";

/** Digits stand-in for a masked money hero; the unit stays a constant "VND" so magnitude is not leaked. */
export const MASKED_HERO_VALUE = "•••";
export const MASKED_MONEY = `${MASKED_HERO_VALUE} VND`;
export { UNKNOWN_TEXT };

/** The single mask decision: unknown wins, then masked, else the real formatting. */
function maskMoney<T>(amount: MaybeAmount, masked: boolean, ifUnknown: T, ifMasked: T, format: (n: number) => T): T {
  if (isUnknownAmount(amount)) return ifUnknown;
  return masked ? ifMasked : format(amount as number);
}

export function formatWrappedMoney(amount: MaybeAmount, masked: boolean): string {
  return maskMoney(amount, masked, UNKNOWN_TEXT, MASKED_MONEY, (n) => formatVnd(n));
}

export type WrappedMoneyHero = Pick<WrappedHero, "value" | "unit" | "countTo">;

/** Scale like `formatVndCompact` (tỷ / tr / K): [divisor, unit]. */
function scaleOf(abs: number): [number, string] {
  if (abs >= 1_000_000_000) return [1_000_000_000, "tỷ"];
  if (abs >= 1_000_000) return [1_000_000, "tr"];
  if (abs >= 1_000) return [1_000, "K"];
  return [1, "VND"];
}

/** Decimals `formatVndCompact` would print: 2 places, trailing zeros trimmed. */
function decimalsOf(scaled: number): number {
  const trimmed = scaled.toFixed(2).replace(/\.?0+$/, "");
  const dot = trimmed.indexOf(".");
  return dot === -1 ? 0 : trimmed.length - dot - 1;
}

/**
 * Compact hero digits + unit for an amount ("73,85" + "tr"); `null` when unknown.
 * Masked: "•••" + constant "VND", no `countTo`. `countTo.to` is exactly the number
 * printed in `value`, so the count-up always lands on what the static render shows.
 */
export function wrappedHeroMoney(amount: MaybeAmount, masked: boolean): WrappedMoneyHero | null {
  return maskMoney<WrappedMoneyHero | null>(amount, masked, null, { value: MASKED_HERO_VALUE, unit: "VND" }, (n) => {
    const sign = n < 0 ? -1 : 1;
    const [divisor, unit] = scaleOf(Math.abs(n));
    const scaled = Math.abs(n) / divisor;
    const decimals = divisor === 1 ? 0 : decimalsOf(scaled);
    const to = Number(scaled.toFixed(decimals)) * sign;
    return { value: heroDigits(to, decimals), unit, countTo: { to, decimals } };
  });
}
