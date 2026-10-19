import { addMonthsToKey, dateToMonthKey } from "@/domain/engine/types";
import {
  formatWrappedMoney,
  formatWrappedPct,
  sanitizeLabel,
  WRAPPED_MONTHS,
  type WrappedDeck,
  type WrappedSlide,
} from "@/domain/wrapped";
import type { WrappedDeckCtx } from "./wrapped-deck-context";

/** A positive value never draws thinner than this share of the tallest bar. */
const MIN_RATIO = 0.06;
const MAX_JARS = 4;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Bar heights as a ratio to the largest known value (0..1). Unknown stays `null` (a gap);
 * a known 0 stays 0 (an explicit baseline tick, not a gap); a positive value gets a visible
 * floor, so the lowest known month is never drawn like a missing one. Not min-max: that
 * would draw the lowest month at 0 and a flat series at mid-height.
 */
export function ratioToMax(values: readonly (number | "unknown")[]): (number | null)[] {
  const max = values.reduce<number>((acc, v) => (finite(v) && v > acc ? v : acc), 0);
  return values.map((v) => {
    if (!finite(v)) return null;
    if (v <= 0 || max <= 0) return 0;
    return Math.max(v / max, MIN_RATIO);
  });
}

/** Month keys of a window, oldest first, from the ISO of its first instant (`Period.from`). */
export function windowMonthKeys(periodFromIso: string, count: number): string[] {
  const first = dateToMonthKey(new Date(periodFromIso));
  return Array.from({ length: count }, (_, i) => addMonthsToKey(first, i));
}

/** "2026-07" -> "T7". */
export const monthShort = (key: string): string => `T${Number(key.split("-")[1])}`;

/**
 * What the visuals need beyond their own slide, derived once from the frozen deck.
 * A month is known when the `total-spend` series holds a number for it; nothing is
 * known if that slide is absent (never assumed to have data).
 */
export function deckVisualContext(deck: WrappedDeck): WrappedDeckCtx {
  const series = deck.slides.find((s) => s.id === "total-spend")?.series;
  const monthKeys = windowMonthKeys(deck.period.from, WRAPPED_MONTHS);
  return {
    periodFrom: deck.period.from,
    monthKeys,
    monthKnown: monthKeys.map((_, i) => finite(series?.[i])),
  };
}

const factValue = (slide: WrappedSlide, id: string) => slide.facts.find((f) => f.id === id)?.value;
const numOrNull = (slide: WrappedSlide, id: string): number | null => {
  const v = factValue(slide, id);
  return finite(v) ? v : null;
};

export interface JarRow {
  rank: number;
  label: string;
  /** Percent 0..100, or null when unknown (drawn as an empty jar, never as 0). */
  share: number | null;
  shareText: string;
  /** Already masked: no digits while masked. */
  amountText: string;
}

/** Up to 4 jars in rank order, every string through the shared formatters. */
export function jarRows(slide: WrappedSlide, masked: boolean): JarRow[] {
  const rows: JarRow[] = [];
  for (let rank = 1; rank <= MAX_JARS; rank += 1) {
    const label = factValue(slide, `jar.${rank}.label`);
    if (typeof label !== "string") break;
    const share = numOrNull(slide, `jar.${rank}.share`);
    rows.push({
      rank,
      label: sanitizeLabel(label),
      share: share === null ? null : Math.min(Math.max(share, 0), 100),
      shareText: formatWrappedPct(share ?? "unknown"),
      amountText: formatWrappedMoney(numOrNull(slide, `jar.${rank}.amount`), masked),
    });
  }
  return rows;
}

/** Formatted share of fixed spend, or null when unknown (the caption is then omitted). */
export function fixedShareText(slide: WrappedSlide): string | null {
  const fixed = numOrNull(slide, "fixed-share");
  return fixed === null ? null : formatWrappedPct(fixed);
}

export interface WeekdayColumn {
  /** VN weekday: 0 = Chủ nhật .. 6 = Thứ bảy. */
  day: number;
  label: string;
  /** 0..1, or null when unknown. Masked: 1 for every known day (no proportion). */
  height: number | null;
  peak: boolean;
  weekend: boolean;
}

/** Display order Thứ hai .. Chủ nhật. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

export function weekdayColumns(slide: WrappedSlide, masked: boolean): WeekdayColumn[] {
  const spend = WEEK_ORDER.map((day) => numOrNull(slide, `weekday.${day}.spend`));
  const ratios = ratioToMax(spend.map((v) => v ?? "unknown"));
  const peak = numOrNull(slide, "peak-weekday");
  return WEEK_ORDER.map((day, i) => ({
    day,
    label: WEEKDAY_LABEL[day],
    height: ratios[i] === null ? null : masked ? 1 : ratios[i],
    peak: day === peak,
    weekend: day === 0 || day === 6,
  }));
}
