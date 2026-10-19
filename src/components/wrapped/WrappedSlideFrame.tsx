import { useIsPresent } from "motion/react";
import { lowestTrust } from "@/domain/engine/provenance";
import type { WrappedCopyLine, WrappedSlide, WrappedSlideCopy } from "@/domain/wrapped";
import { cn } from "@/lib/cn";
import type { WrappedDeckCtx } from "./wrapped-deck-context";
import { WrappedHeroNumber } from "./wrapped-hero-number";
import { ArchetypeFlipCard } from "./archetype-flip-card";
import { slideVisualFor } from "./wrapped-slide-visual";
import { isLineShown, SLIDE_LAYOUT, SLIDE_THEMES, themeVars } from "./wrapped-slide-themes";
import { STACK, WrappedBrandCard, WrappedSlideCta, WrappedSlideFootnote, WrappedSlideLines } from "./wrapped-slide-body";
import { WrappedSurfaceCard } from "./wrapped-surface-card";

/** Tagged lines when the copy layer provided them, else the plain body split (all shown). */
function linesOf(copy: WrappedSlideCopy): readonly WrappedCopyLine[] {
  if (copy.lines) return copy.lines;
  return copy.body ? copy.body.split("\n").map((text) => ({ kind: "insufficient" as const, text })) : [];
}

/**
 * One slide on its theme field (`SLIDE_THEMES[id].mode`):
 *  - `light`: solid cream/peach field; title, hero, body lines and footnote in navy on
 *    the field, the visual inside a white `WrappedSurfaceCard`.
 *  - `brand`: the `.wrapped-brand-field` gradient carries only large text (title and
 *    hero with its 19px-bold caption); the visual, body lines, footnote, badge and CTA
 *    sit in one white card (the archetype flip card stays between, so the order holds).
 * Colours reach every child through the `--wr-*` vars set here. Every string comes
 * from `copy`, which the viewer already built through the single masking formatter.
 * The text and visual are `aria-hidden` because the viewer's live region reads
 * `copy.srText` once; the CTA and the archetype flip card sit outside it so their
 * controls stay reachable. While the slide is exiting (`useIsPresent` false) it is
 * also `inert` + `aria-hidden`. The frame lets taps fall through to the viewer's tap
 * zones; only the CTA and the flip button catch them.
 */
export function WrappedSlideFrame({
  slide,
  copy,
  masked,
  deckCtx,
}: {
  slide: WrappedSlide;
  copy: WrappedSlideCopy;
  masked: boolean;
  deckCtx: WrappedDeckCtx;
}) {
  const present = useIsPresent();
  const theme = SLIDE_THEMES[slide.id];
  const spec = SLIDE_LAYOUT[slide.id];
  const brand = theme.mode === "brand";
  const footnote = spec.showFootnote ? copy.footnote : undefined;
  const lines = linesOf(copy).filter((l) => isLineShown(l.kind, spec, Boolean(copy.hero)));
  const source = slide.facts.length > 0 ? lowestTrust(slide.facts.map((f) => f.source)) : null;
  const hero = copy.hero ? <WrappedHeroNumber hero={copy.hero} largeCaption={brand} /> : null;
  const visual = slideVisualFor({ slide, masked, deckCtx });
  const flip = slide.id === "archetype" ? <ArchetypeFlipCard slide={slide} copy={copy} /> : null;
  const title = (
    <h2 className="text-balance text-[2rem] [@media(max-height:700px)]:text-[1.75rem] font-extrabold leading-tight tracking-tight">
      {copy.title}
    </h2>
  );

  return (
    <div
      data-slide-id={slide.id}
      data-theme-mode={theme.mode}
      inert={!present}
      aria-hidden={present ? undefined : true}
      style={{ ...themeVars(theme), backgroundColor: theme.field, color: "var(--wr-ink)" }}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", brand && "wrapped-brand-field")}
    >
      <div className="relative flex h-full flex-col justify-center-safe gap-4 [@media(max-height:700px)]:gap-3 px-7 pb-[calc(2.5rem+var(--safe-area-bottom))] [@media(max-height:700px)]:pb-[calc(2rem+var(--safe-area-bottom))] pt-[5.25rem]">
        {brand ? (
          <>
            <div aria-hidden className={STACK}>
              {title}
              {hero}
            </div>
            {flip ? (
              <>
                <WrappedBrandCard visual={visual} lines={lines} />
                {flip}
                <WrappedBrandCard footnote={footnote} source={source} cta={copy.cta} />
              </>
            ) : (
              <WrappedBrandCard visual={visual} lines={lines} footnote={footnote} source={source} cta={copy.cta} />
            )}
          </>
        ) : (
          <>
            <div aria-hidden className={STACK}>
              {title}
              {spec.layout === "list-led" ? (
                <>
                  {visual && <WrappedSurfaceCard>{visual}</WrappedSurfaceCard>}
                  {hero}
                </>
              ) : (
                <>
                  {hero}
                  {visual && <WrappedSurfaceCard>{visual}</WrappedSurfaceCard>}
                </>
              )}
              <WrappedSlideLines lines={lines} />
            </div>
            {flip}
            <WrappedSlideFootnote footnote={footnote} source={source} />
            <WrappedSlideCta cta={copy.cta} />
          </>
        )}
      </div>
    </div>
  );
}
