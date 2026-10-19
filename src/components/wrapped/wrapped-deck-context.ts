import type { WrappedHero, WrappedSlideId } from "@/domain/wrapped";

/** One closing-recap tile: another slide's hero (already masked by the copy layer). */
export interface WrappedRecapTile {
  id: WrappedSlideId;
  hero: WrappedHero;
}

/**
 * Deck-level inputs a slide visual may need beyond its own slide. The viewer builds
 * this once per render from the frozen deck; every field after `periodFrom` is
 * optional and filled in by the phase that adds the visual using it.
 */
export interface WrappedDeckCtx {
  /** First instant of the deck's window (`deck.period.from`). */
  periodFrom: string;
  monthKeys?: readonly string[];
  /** Per month of the window: does it have expense data? */
  monthKnown?: readonly boolean[];
  recap?: readonly WrappedRecapTile[];
}
