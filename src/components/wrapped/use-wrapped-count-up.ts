"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { animate, useReducedMotionConfig } from "motion/react";
import { heroDigits, type WrappedHero } from "@/domain/wrapped";

/** Count-up starts here (fraction of the target) so a hero is never seen as "0". */
const START_FRACTION = 0.6;
const DURATION_S = 0.9;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The text a hero number should show. Starts at (and server-renders) `hero.value`;
 * when the copy layer supplied `countTo` (only ever unmasked + known) and motion is
 * allowed it animates from 60% of the target to the target and always ends on
 * `hero.value` exactly. With no `countTo` — masked, unknown, reduced motion — the
 * result is `hero.value` verbatim, so a frame value can never reach a masked render.
 */
export function useWrappedCountUp(hero: WrappedHero): string {
  const reduce = useReducedMotionConfig();
  const [display, setDisplay] = useState(hero.value);
  const countTo = hero.countTo;
  const { value } = hero;

  useIsoLayoutEffect(() => {
    if (!countTo || reduce) {
      setDisplay(value);
      return undefined;
    }
    const { to, decimals } = countTo;
    setDisplay(heroDigits(START_FRACTION * to, decimals));
    const controls = animate(START_FRACTION * to, to, {
      duration: DURATION_S,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(heroDigits(v, decimals)),
      onComplete: () => setDisplay(value),
    });
    return () => {
      controls.stop();
      setDisplay(value);
    };
  }, [countTo, reduce, value]);

  return countTo && !reduce ? display : value;
}
