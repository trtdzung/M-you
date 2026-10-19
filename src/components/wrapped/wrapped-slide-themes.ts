import type { CSSProperties } from "react";
import type { WrappedLineKind, WrappedSlideId } from "@/domain/wrapped";

/**
 * Per-slide MSB theme in two modes.
 *  - `brand` (opening, archetype, closing): the `.wrapped-brand-field` orange-red
 *    gradient (globals.css). White on its dark stop is only 4.49:1, so ONLY large
 *    text (title, hero, 19px-bold hero caption) sits on it; every other element
 *    lives in a white `WrappedSurfaceCard`.
 *  - `light` (the other six): a solid cream or peach field with navy ink.
 * The frame exposes the theme as `--wr-*` CSS vars; surface cards re-scope ink/muted
 * to navy/`#5f6775`, so visuals (always inside a surface) read the same in both
 * modes. Chart colours: `accent` `#c2410c` (5.18:1 on white, white text on it 5.18:1)
 * over `track` `#f9c4a8` (accent vs track 3.33:1). Brand `#f26522` is never a chart or text colour.
 */
export type WrappedThemeMode = "brand" | "light";

export interface WrappedSlideTheme {
  mode: WrappedThemeMode;
  /** Solid fill (hex); brand = darkest gradient stop, the fallback under the CSS class. */
  field: string;
  /** Text and shape colour ON THE FIELD (hex). */
  ink: string;
  /** Secondary text ON THE FIELD (hex). Brand: = ink (normal-size text never sits on the gradient). */
  muted: string;
  /** Meter/bar track and non-peak bars, inside surfaces (hex). */
  track: string;
  /** Card colour; also the text colour on accent tiles (hex). */
  surface: string;
  /** Peak / meter fill, inside surfaces (hex). */
  accent: string;
}

export const SURFACE = {
  surface: "#ffffff",
  ink: "#1f2a44",
  muted: "#5f6775",
  // WCAG 1.4.11 exception: track bars are 1.56:1 on white, but every value they shape is also in body text (redundant info).
  track: "#f9c4a8",
  accent: "#c2410c",
} as const;

/** Must match `.wrapped-brand-field` in globals.css (drift-checked by the themes test). */
export const BRAND_FIELD = { from: "#e2301c", to: "#f2621f", glowAlpha: 0.25, glowReach: 0.45 } as const;

const light = (field: "#faf8f6" | "#fff1ea"): WrappedSlideTheme => ({
  mode: "light",
  field,
  ink: SURFACE.ink,
  muted: SURFACE.muted,
  track: SURFACE.track,
  surface: SURFACE.surface,
  accent: SURFACE.accent,
});

const brand: WrappedSlideTheme = {
  mode: "brand",
  field: BRAND_FIELD.from,
  ink: "#ffffff",
  muted: "#ffffff",
  track: SURFACE.track,
  surface: SURFACE.surface,
  accent: SURFACE.accent,
};

export const SLIDE_THEMES: Record<WrappedSlideId, WrappedSlideTheme> = {
  opening: brand,
  "total-spend": light("#faf8f6"),
  "jar-share": light("#fff1ea"),
  "top-merchants": light("#faf8f6"),
  habits: light("#fff1ea"),
  recurring: light("#faf8f6"),
  archetype: brand,
  health: light("#fff1ea"),
  closing: brand,
};

/** Frame root: the field-level vars every slide element inherits. */
export const themeVars = (t: WrappedSlideTheme): CSSProperties =>
  ({
    "--wr-ink": t.ink,
    "--wr-muted": t.muted,
    "--wr-track": t.track,
    "--wr-surface": t.surface,
    "--wr-accent": t.accent,
  }) as CSSProperties;

/** Surface cards re-scope only ink/muted (track/surface/accent are inherited from the frame). */
export const SURFACE_VARS = { "--wr-ink": SURFACE.ink, "--wr-muted": SURFACE.muted } as CSSProperties;

export type WrappedSlideLayout = "number-led" | "chart-led" | "list-led" | "card-led";

export interface WrappedSlideLayoutSpec {
  layout: WrappedSlideLayout;
  /** Body line kinds replaced by a visual. `insufficient` is never hidden, whatever is listed. */
  hideKinds: readonly WrappedLineKind[];
  /** Line kind the hero replaces — hidden only while `copy.hero` is present. */
  heroKind?: WrappedLineKind;
  /**
   * Show the assumption footnote on screen. Off by default (product call: the technical
   * caveats read as noise); the facts keep their assumptions and `srText` still reads them.
   */
  showFootnote?: boolean;
}

/**
 * A slide keeps all its body lines until the change that adds its visual hides the
 * kinds that visual replaces. Exact amounts (`total`, `peak-month`, `peak-day`) and
 * `insufficient` lines are never hidden.
 */
export const SLIDE_LAYOUT: Record<WrappedSlideId, WrappedSlideLayoutSpec> = {
  opening: { layout: "number-led", hideKinds: [] },
  "total-spend": { layout: "number-led", hideKinds: [] },
  "jar-share": { layout: "chart-led", hideKinds: ["jar-row", "fixed-share"] },
  "top-merchants": { layout: "list-led", hideKinds: ["merchant-row", "top3"], heroKind: "distinct" },
  habits: { layout: "chart-led", hideKinds: [], heroKind: "weekend" },
  recurring: { layout: "list-led", hideKinds: ["recurring-item"] },
  archetype: { layout: "card-led", hideKinds: ["description", "evidence"], showFootnote: true },
  health: { layout: "chart-led", hideKinds: ["health-pillar"], heroKind: "health-score" },
  closing: { layout: "card-led", hideKinds: [], heroKind: "quality" },
};

/** A body line is shown unless its kind is hidden, or the hero stands in for it. `insufficient` always shows. */
export function isLineShown(
  kind: WrappedLineKind,
  spec: WrappedSlideLayoutSpec,
  hasHero: boolean,
): boolean {
  if (kind === "insufficient") return true;
  if (spec.hideKinds.includes(kind)) return false;
  return !(hasHero && spec.heroKind === kind);
}
