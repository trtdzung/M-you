import type { WrappedThemeMode } from "./wrapped-slide-themes";

export interface WrappedChrome {
  /** Progress segment track. */
  track: string;
  /** Progress segment fill (past + current). */
  fill: string;
  /** Eye / close round buttons (colours + hover + focus ring). */
  control: string;
  /** Partial-coverage chip. */
  chip: string;
  /**
   * Ring colour of the prev/next tap-zone focus overlays (drawn ABOVE the opaque slide
   * on the zone's `peer-focus-visible`). Brand is solid white: white/70 on `#f2621f`
   * is only 2.27:1, below the 3:1 non-text minimum.
   */
  tapRing: string;
  /** The white MSB logo shows only on the brand gradient. */
  showLogo: boolean;
}

/**
 * Viewer chrome per theme mode. Literal class strings so Tailwind v4 picks them up.
 * This is, with the entry card, the only wrapped module allowed to use `white`
 * colour classes: on the brand gradient the chrome is white on a black/30 scrim, on
 * the light fields it is navy (`text`).
 */
export const CHROME: Record<WrappedThemeMode, WrappedChrome> = {
  brand: {
    track: "bg-white/35",
    fill: "bg-white",
    control: "bg-black/30 text-white hover:bg-black/45 focus-visible:ring-white",
    chip: "bg-black/30 text-white",
    tapRing: "ring-white",
    showLogo: true,
  },
  light: {
    track: "bg-text/15",
    fill: "bg-text",
    control: "bg-text/10 text-text hover:bg-text/20 focus-visible:ring-text",
    chip: "bg-text/10 text-text",
    tapRing: "ring-text/60",
    showLogo: false,
  },
};
