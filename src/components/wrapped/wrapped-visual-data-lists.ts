import {
  copyForSlide,
  formatWrappedCount,
  formatWrappedMoney,
  formatWrappedPct,
  sanitizeLabel,
  type WrappedSlide,
  type WrappedSlideId,
} from "@/domain/wrapped";
import type { WrappedRecapTile } from "./wrapped-deck-context";
import { EVIDENCE_LABEL, RECAP_ARCHETYPE_CAPTION } from "./wrapped-ui-copy";
import { ratioToMax } from "./wrapped-visual-data-spend";

/** Slides whose hero feeds the closing recap bento. */
export const RECAP_IDS: ReadonlySet<WrappedSlideId> = new Set<WrappedSlideId>([
  "total-spend",
  "jar-share",
  "top-merchants",
  "habits",
  "recurring",
  "archetype",
]);

/** Safety cap; the domain already limits both lists (3 merchants, 5 recurring items). */
const MAX_ROWS = 8;
/** A small positive share never vanishes from a meter. */
const MIN_METER = 0.06;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const factValue = (slide: WrappedSlide, id: string) => slide.facts.find((f) => f.id === id)?.value;
const numOrNull = (slide: WrappedSlide, id: string): number | null => {
  const v = factValue(slide, id);
  return finite(v) ? v : null;
};
const textOrEmpty = (slide: WrappedSlide, id: string): string => {
  const v = factValue(slide, id);
  return typeof v === "string" ? sanitizeLabel(v) : "";
};

export interface MerchantRow {
  rank: number;
  name: string;
  /** First grapheme, upper-cased ("Ăn" -> "Ă"). */
  monogram: string;
  /** Visit count, or null when unknown (drawn as "—" with no bar, never 0). */
  visits: number | null;
  visitsText: string;
  /** Visits as a share of the busiest merchant (0..1, floored when positive), null when unknown. */
  barRatio: number | null;
  /** Already masked: no digits while masked. */
  spendText: string;
}

/** Up to three ranked merchants. Visits are counts (kept visible when masked); spend goes through the masking formatter. */
export function merchantRows(slide: WrappedSlide, masked: boolean): MerchantRow[] {
  const rows: { rank: number; name: string; visits: number | null; spendText: string }[] = [];
  for (let rank = 1; rank <= MAX_ROWS; rank += 1) {
    if (typeof factValue(slide, `merchant.${rank}.name`) !== "string") break;
    rows.push({
      rank,
      name: textOrEmpty(slide, `merchant.${rank}.name`),
      visits: numOrNull(slide, `merchant.${rank}.visits`),
      spendText: formatWrappedMoney(numOrNull(slide, `merchant.${rank}.spend`), masked),
    });
  }
  const ratios = ratioToMax(rows.map((r) => r.visits ?? "unknown"));
  return rows.map((r, i) => ({
    ...r,
    monogram: Array.from(r.name)[0]?.toLocaleUpperCase("vi-VN") ?? "?",
    visitsText: r.visits === null ? "—" : formatWrappedCount(r.visits),
    barRatio: ratios[i],
  }));
}

/** Formatted share of visits held by the top three merchants, or null when unknown. */
export function top3ShareText(slide: WrappedSlide): string | null {
  const share = numOrNull(slide, "top3-share");
  return share === null ? null : formatWrappedPct(share);
}

export interface RecurringRow {
  rank: number;
  label: string;
  category: string;
  /** Already masked; "Chưa rõ" when unknown. */
  annualText: string;
}

export function recurringRows(slide: WrappedSlide, masked: boolean): RecurringRow[] {
  const rows: RecurringRow[] = [];
  for (let rank = 1; rank <= MAX_ROWS; rank += 1) {
    if (typeof factValue(slide, `recurring.${rank}.label`) !== "string") break;
    rows.push({
      rank,
      label: textOrEmpty(slide, `recurring.${rank}.label`),
      category: textOrEmpty(slide, `recurring.${rank}.category`),
      annualText: formatWrappedMoney(numOrNull(slide, `recurring.${rank}.annual`), masked),
    });
  }
  return rows;
}

export interface EvidenceRow {
  id: keyof typeof EVIDENCE_LABEL;
  label: string;
  valueText: string;
  /** 0..1 for a percent fact; null for a plain count (no meter). */
  meter: number | null;
}

const EVIDENCE_PCT_IDS = ["fixed-share-excl-person", "weekend-share-excl-person", "top3-share"] as const;

/** Known evidence only, in the domain's order; an unknown or absent fact is omitted, never a 0 meter. */
export function archetypeEvidence(slide: WrappedSlide): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  for (const fact of slide.facts) {
    const id = fact.id as EvidenceRow["id"];
    if (!Object.hasOwn(EVIDENCE_LABEL, id) || !finite(fact.value)) continue;
    const isPct = (EVIDENCE_PCT_IDS as readonly string[]).includes(id);
    const share = isPct ? Math.min(Math.max(fact.value, 0), 100) / 100 : null;
    rows.push({
      id,
      label: EVIDENCE_LABEL[id],
      valueText: isPct ? formatWrappedPct(fact.value) : formatWrappedCount(fact.value),
      meter: share === null ? null : share > 0 ? Math.max(share, MIN_METER) : 0,
    });
  }
  return rows;
}

/**
 * The closing bento's tiles: each recap slide's hero (already masked by the copy
 * layer; money heroes share the formatter's mask decision), in deck order. A slide
 * with no hero gets no tile. The archetype tile is its name, only when a label was assigned.
 */
export function recapTiles(slides: readonly WrappedSlide[], masked: boolean): WrappedRecapTile[] {
  const tiles: WrappedRecapTile[] = [];
  for (const slide of slides) {
    if (!RECAP_IDS.has(slide.id)) continue;
    const copy = copyForSlide(slide, masked);
    if (slide.id === "archetype") {
      if (copy.lines?.some((l) => l.kind === "description")) {
        tiles.push({ id: slide.id, hero: { value: copy.title, caption: RECAP_ARCHETYPE_CAPTION } });
      }
    } else if (copy.hero) {
      tiles.push({ id: slide.id, hero: copy.hero });
    }
  }
  return tiles;
}
