"use client";

import type { WrappedHero } from "@/domain/wrapped";
import { useWrappedCountUp } from "./use-wrapped-count-up";

/** Short values (up to 4 chars) get the biggest size; longer ones step down to fit 319px. */
const LONG_VALUE_CHARS = 4;

/**
 * The slide's giant number: tabular digits, unit at title size, caption at body
 * size — or, with `largeCaption` (brand gradient slides), 19px bold so it counts as
 * WCAG large text on the gradient. `aria-hidden` — the live region reads `copy.srText`, which already holds the
 * exact (masked) figure. The digits come from `useWrappedCountUp`, which only ever
 * returns `hero.value` unless an unmasked count-up is running.
 */
export function WrappedHeroNumber({ hero, largeCaption = false }: { hero: WrappedHero; largeCaption?: boolean }) {
  const shown = useWrappedCountUp(hero);
  // Short screens (e.g. 375x667) step each size down one notch so the slide still fits.
  const size =
    hero.value.length <= LONG_VALUE_CHARS
      ? "text-[6rem] [@media(max-height:700px)]:text-[4.5rem]"
      : "text-[4.5rem] [@media(max-height:700px)]:text-[3.75rem]";
  return (
    <div aria-hidden data-testid="wrapped-hero" className="flex flex-col gap-1">
      <p className="flex items-baseline gap-2 font-extrabold tabular-nums leading-none tracking-[-0.04em]">
        <span data-hero-value className={size}>
          {shown}
        </span>
        {hero.unit && <span className="text-[2rem] leading-none tracking-tight">{hero.unit}</span>}
      </p>
      <p className={largeCaption ? "text-[1.1875rem] font-bold leading-snug" : "text-base font-medium leading-snug"}>
        {hero.caption}
      </p>
    </div>
  );
}
