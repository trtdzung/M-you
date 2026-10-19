"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, domAnimation, LazyMotion, m, MotionConfig } from "motion/react";
import { copyForSlide, type WrappedDeck } from "@/domain/wrapped";
import { CHROME } from "./wrapped-chrome-classes";
import { WrappedSlideFrame } from "./WrappedSlideFrame";
import { SLIDE_THEMES } from "./wrapped-slide-themes";
import { pageOf, VIEWER } from "./wrapped-ui-copy";
import { WrappedViewerTopBar } from "./wrapped-viewer-top-bar";
import { recapTiles } from "./wrapped-visual-data-lists";
import { deckVisualContext } from "./wrapped-visual-data-spend";

const TAP_ZONE = "absolute inset-y-0 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none";
/**
 * Focus ring of a tap zone. The zones sit UNDER the opaque slide, so their own ring
 * would be covered; this click-through overlay comes AFTER the slide and shows the
 * ring while its zone (`peer/prev` / `peer/next`) is keyboard-focused. Raising the
 * zones instead would steal taps from the CTA and the flip button.
 */
const TAP_RING = "pointer-events-none absolute inset-y-0 hidden ring-2 ring-inset";

/** The slide enters from the side it was navigated towards and leaves the other way (transform + opacity only). */
const SLIDE_VARIANTS = {
  enter: (direction: number) => ({ x: `${direction * 24}%`, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: `${direction * -24}%`, opacity: 0 }),
};
const SLIDE_TRANSITION = { type: "spring", stiffness: 260, damping: 30 } as const;

/**
 * The story. MANUAL navigation only — tap left third = back, right two thirds =
 * next, ArrowLeft/ArrowRight, Escape closes. No auto-advance, no hold-to-pause.
 *
 * Guarantees the deck relies on:
 *  - the deck is FROZEN at mount (`useState(() => deck)`), so a background recompute
 *    can never swap slides or leave the index pointing into a different deck;
 *  - the index is clamped to the deck, so it can never address a missing slide;
 *  - amounts are visible by default, one eye toggle masks them through the single
 *    shared formatter (`copyForSlide(slide, masked)`), and the viewer re-masks when
 *    the tab is hidden, the window blurs or the page is hidden, and on close. Mask
 *    state is never persisted;
 *  - slide changes are directional motion transitions that never block navigation:
 *    every wrapper node down to the slide is click-through, and the presence boundary
 *    is re-keyed on a mask toggle so no exiting slide can keep showing amounts.
 */
export function WrappedStoryViewer({ deck, onClose }: { deck: WrappedDeck; onClose: () => void }) {
  const [frozen] = useState(deck);
  const { slides } = frozen;
  const total = slides.length;
  const [requested, setRequested] = useState(0);
  const [masked, setMasked] = useState(false);
  const [direction, setDirection] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);

  const index = Math.min(Math.max(requested, 0), Math.max(total - 1, 0));
  const slide = slides[index];
  const copy = useMemo(() => (slide ? copyForSlide(slide, masked) : null), [slide, masked]);
  // The recap tiles carry other slides' heroes, so they follow the mask like every other string.
  const recap = useMemo(() => recapTiles(frozen.slides, masked), [frozen, masked]);
  const deckCtx = useMemo(() => ({ ...deckVisualContext(frozen), recap }), [frozen, recap]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setRequested(Math.max(index - 1, 0));
  }, [index]);
  const goNext = useCallback(() => {
    setDirection(1);
    setRequested(Math.min(index + 1, total - 1));
  }, [index, total]);
  const close = useCallback(() => {
    setMasked(true); // never leave amounts revealed behind us
    onClose();
  }, [onClose]);

  useEffect(() => closeRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
      else if (event.key === "Escape") close();
    };
    const mask = () => setMasked(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") mask();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    // App switching and bfcache don't always flip visibility: also re-mask on blur / pagehide.
    window.addEventListener("blur", mask);
    window.addEventListener("pagehide", mask);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", mask);
      window.removeEventListener("pagehide", mask);
    };
  }, [goPrev, goNext, close]);

  if (!slide || !copy) return null;
  const mode = SLIDE_THEMES[slide.id].mode;
  const tapZone = `${TAP_ZONE} pointer-events-auto`;
  const tapRing = `${TAP_RING} ${CHROME[mode].tapRing}`;

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div
          role="region"
          aria-label={VIEWER.region}
          className="relative flex h-full min-h-0 flex-col overflow-hidden bg-text"
        >
          <div
            role="group"
            aria-roledescription={VIEWER.slide}
            aria-label={pageOf(index + 1, total)}
            className="pointer-events-none relative min-h-0 flex-1"
          >
            {/* Tap zones sit UNDER the slide; the slide is click-through except its CTA.
                At a deck end they are aria-disabled (not `disabled`) with no handler: a
                truly disabled focused control would drop keyboard focus to <body>. */}
            <button
              type="button"
              aria-label={VIEWER.previous}
              aria-disabled={index === 0}
              onClick={index === 0 ? undefined : goPrev}
              className={`peer/prev ${tapZone} left-0 w-1/3`}
            />
            <button
              type="button"
              aria-label={VIEWER.next}
              aria-disabled={index === total - 1}
              onClick={index === total - 1 ? undefined : goNext}
              className={`peer/next ${tapZone} right-0 w-2/3`}
            />
            <AnimatePresence key={String(masked)} initial={false} custom={direction}>
              <m.div
                key={slide.id}
                custom={direction}
                variants={SLIDE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={SLIDE_TRANSITION}
                className="pointer-events-none absolute inset-0"
              >
                <WrappedSlideFrame slide={slide} copy={copy} masked={masked} deckCtx={deckCtx} />
              </m.div>
            </AnimatePresence>
            <div aria-hidden data-tap-ring="prev" className={`${tapRing} left-0 w-1/3 peer-focus-visible/prev:block`} />
            <div aria-hidden data-tap-ring="next" className={`${tapRing} right-0 w-2/3 peer-focus-visible/next:block`} />
          </div>

          <WrappedViewerTopBar
            mode={mode}
            count={total}
            index={index}
            monthsWithData={frozen.coverage.monthsWithData}
            monthsTotal={frozen.coverage.monthsTotal}
            masked={masked}
            onToggleMask={() => setMasked((v) => !v)}
            onClose={close}
            closeRef={closeRef}
          />

          <p aria-live="polite" aria-atomic className="sr-only">
            {pageOf(index + 1, total)}. {copy.srText}
          </p>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
