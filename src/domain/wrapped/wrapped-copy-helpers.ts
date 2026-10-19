/** Shared plumbing for the per-slide Vietnamese copy functions. Pure. */

import { sanitizeLabel } from "./sanitize-label";
import { MASKED_MONEY } from "./wrapped-money-format";
import { formatWrappedCount, formatWrappedPct, UNKNOWN_TEXT } from "./wrapped-number-format";
import type { WrappedFact, WrappedSlide } from "./wrapped-types";

/** What a body line reports; the UI filters lines by kind (never by position). */
export type WrappedLineKind =
  | "period"
  | "months"
  | "txn-count"
  | "total"
  | "peak-month"
  | "jar-row"
  | "fixed-share"
  | "merchant-row"
  | "distinct"
  | "top3"
  | "weekend"
  | "peak-day"
  | "recurring-total"
  | "recurring-item"
  | "description"
  | "evidence"
  | "quality"
  | "taught"
  | "health-score"
  | "health-pillar"
  | "health-coverage"
  /** A line that reports missing data ("Chưa rõ" / "Chưa đủ dữ liệu"). Always shown. */
  | "insufficient";

export interface WrappedCopyLine {
  kind: WrappedLineKind;
  text: string;
}

/** The giant number a slide leads with. Omitted entirely when its source fact is unknown. */
export interface WrappedHero {
  /** Digits as shown (masked money: "•••"); never an animation frame value. */
  value: string;
  unit?: string;
  caption: string;
  /** Present only when unmasked and known; `to` equals the number printed in `value`. */
  countTo?: { to: number; decimals: number };
}

export interface WrappedSlideCopy {
  title: string;
  /** Lines separated by "\n" (render with `whitespace-pre-line`); always `lines.map(text)`. */
  body: string;
  /** The same lines tagged by kind (additive; `body` and `srText` do not depend on it). */
  lines?: readonly WrappedCopyLine[];
  hero?: WrappedHero;
  footnote?: string;
  /** Call to action, only on slides that have one (closing). */
  cta?: string;
  /** Full sentence(s) for assistive tech; built from the same masked strings as the visible copy. */
  srText: string;
}

export const factOf = (slide: WrappedSlide, id: string): WrappedFact | undefined =>
  slide.facts.find((f) => f.id === id);

/** The numeric value of a fact, or null when it is missing or `"unknown"` (never coerced to 0). */
export function numOf(slide: WrappedSlide, id: string): number | null {
  const v = factOf(slide, id)?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A text fact, re-sanitized at the copy boundary; "" when missing. */
export function textOf(slide: WrappedSlide, id: string): string {
  const v = factOf(slide, id)?.value;
  return typeof v === "string" ? sanitizeLabel(v) : "";
}

/** 1-based ranks present for `<prefix>.<rank>.<field>` facts, ascending. */
export function ranksOf(slide: WrappedSlide, prefix: string, field: string): number[] {
  const ranks: number[] = [];
  for (let rank = 1; factOf(slide, `${prefix}.${rank}.${field}`); rank += 1) ranks.push(rank);
  return ranks;
}

/** First non-empty `assumption` among the given fact ids (the caveat the slide footnotes). */
export function assumptionOf(slide: WrappedSlide, ...ids: string[]): string | undefined {
  for (const id of ids) {
    const a = factOf(slide, id)?.assumption;
    if (a) return a;
  }
  return undefined;
}

export const line = (kind: WrappedLineKind, text: string): WrappedCopyLine => ({ kind, text });

/**
 * A line built from formatted `values`: when any of them is "Chưa rõ" the line reports
 * missing data, so it is tagged `insufficient` (always shown) and can never be hidden
 * along with a visual — an unknown value must stay visible, never vanish (#6).
 */
export const rowLine = (kind: WrappedLineKind, text: string, ...values: string[]): WrappedCopyLine =>
  line(values.includes(UNKNOWN_TEXT) ? "insufficient" : kind, text);

/** Percent hero. Counts up only when the static text is the plain rounded integer (99.6 -> "99%", 0.4 -> "<1%" never animate). */
export function heroPct(value: number | null, caption: string): WrappedHero | null {
  if (value === null || !caption) return null;
  const text = formatWrappedPct(value);
  const rounded = Math.round(value);
  if (text === `${rounded}%`) {
    return { value: String(rounded), unit: "%", caption, countTo: { to: rounded, decimals: 0 } };
  }
  return { value: text.replace(/%$/, ""), unit: "%", caption };
}

/** Count hero. Counts up only while the printed digits carry no thousands grouping. */
export function heroCount(value: number | null, caption: string): WrappedHero | null {
  if (value === null) return null;
  const text = formatWrappedCount(value);
  const plain = Number.isInteger(value) && value >= 0 && text === String(value);
  return { value: text, caption, ...(plain ? { countTo: { to: value, decimals: 0 } } : {}) };
}

/** Assemble a copy object; `body` and `srText` are derived from the already-masked lines. */
export function makeCopy(parts: {
  title: string;
  lines: WrappedCopyLine[];
  hero?: WrappedHero | null;
  footnote?: string;
  cta?: string;
}): WrappedSlideCopy {
  const texts = parts.lines.map((l) => l.text);
  const body = texts.join("\n");
  const spoken = [parts.title, ...texts, parts.footnote, parts.cta]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.split(MASKED_MONEY).join("số tiền đã ẩn"))
    .map((s) => s.replace(/\.+$/, ""));
  return {
    title: parts.title,
    body,
    lines: parts.lines,
    ...(parts.hero ? { hero: parts.hero } : {}),
    ...(parts.footnote ? { footnote: parts.footnote } : {}),
    ...(parts.cta ? { cta: parts.cta } : {}),
    srText: `${spoken.join(". ")}.`,
  };
}
