/**
 * One stable color map keyed by category id, shared by the Dòng tiền donut and
 * bar list so a category is the same hue in both (red-team #8 — never two
 * palettes). Colors are assigned by the category's fixed position in the expense
 * taxonomy, so a category keeps its hue across periods and jar filters. The
 * palette is a small, harmonious set (brand orange + supporting hues), not a
 * rainbow; orphans / unknown ids fall back to a neutral slate.
 */

import { CATEGORIES } from "@/domain/models";

/**
 * ≤8 hues as one accent-anchored family: MSB brand orange leads, followed by a
 * warm analogous run (coral → apricot → amber → sienna) and three muted cool
 * supports (teal → slate blue → plum). Warm-dominant and moderated in chroma so
 * it reads as a coordinated MSB set, not a rainbow (Phase 05 C4). Slot ordering
 * is the stability contract (RT #8) — only these VALUES are tuned, never which
 * categoryId maps to which slot.
 */
const PALETTE = [
  "#f26522", // 0 brand orange — primary accent
  "#e8654e", // 1 coral (warm)
  "#f2a24a", // 2 apricot (warm)
  "#d98324", // 3 amber (warm)
  "#a8562a", // 4 sienna (warm)
  "#0e7490", // 5 teal (cool complement, muted)
  "#3f6d8e", // 6 slate blue (cool, muted)
  "#6b4e71", // 7 plum (cool, desaturated)
] as const;

/** Neutral for the catch-all "Khác" group and any unmapped id. */
export const CATEGORY_COLOR_FALLBACK = "#94a3b8";

const EXPENSE_ORDER: readonly string[] = CATEGORIES.filter((c) => c.kind === "expense").map(
  (c) => c.id,
);

const COLOR_BY_ID: Map<string, string> = new Map(
  EXPENSE_ORDER.map((id, i) => [id, PALETTE[i % PALETTE.length]]),
);

/** Stable color for a category id (fallback slate for orphans/unknown). */
export function categoryColor(categoryId: string): string {
  return COLOR_BY_ID.get(categoryId) ?? CATEGORY_COLOR_FALLBACK;
}

/** The jar-color swatches offered in settings (the shared accent family). */
export const JAR_COLOR_OPTIONS: readonly string[] = PALETTE;

/**
 * A jar's display accent: its stored `color` if the user picked one, else the
 * hue of its first category, else neutral slate (a category-less jar like
 * "Tiết kiệm"). Keeps one source of truth for jar color across screens.
 */
export function jarAccent(jar: { color?: string; categoryIds: string[] }): string {
  if (jar.color) return jar.color;
  const first = jar.categoryIds[0];
  return first ? categoryColor(first) : CATEGORY_COLOR_FALLBACK;
}
