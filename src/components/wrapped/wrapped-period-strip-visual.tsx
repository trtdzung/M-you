"use client";

import { m, useReducedMotionConfig } from "motion/react";
import { UnknownValue } from "@/components/states";
import { monthShort } from "./wrapped-visual-data-spend";

const STAGGER_S = 0.07;

/**
 * Opening visual: the covered window as "T3 → T8" over a strip of month cells. A
 * month with expense data is a filled `--wr-accent` cell (month name in `--wr-surface`, 5.18:1), one without is an outlined "—" (never
 * a filled or zero cell). Shape and month names only — no amount.
 */
export function WrappedPeriodStripVisual({
  monthKeys,
  monthKnown,
}: {
  monthKeys: readonly string[];
  monthKnown: readonly boolean[];
}) {
  const reduced = useReducedMotionConfig();
  if (monthKeys.length === 0) return null;
  const range = `${monthShort(monthKeys[0])} → ${monthShort(monthKeys[monthKeys.length - 1])}`;

  return (
    <div aria-hidden data-testid="period-strip-visual" className="flex w-full flex-col gap-4">
      <p className="text-[2rem] font-extrabold leading-tight tracking-tight">{range}</p>
      <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${monthKeys.length}, minmax(0, 1fr))` }}>
        {monthKeys.map((key, i) => {
          const known = monthKnown[i] === true;
          return (
            <m.li
              key={key}
              data-known={known ? "true" : "false"}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 300, damping: 26 }}
              className={`flex h-14 items-center justify-center rounded-lg text-sm font-bold ${
                known ? "bg-(--wr-accent) text-(--wr-surface)" : "border border-dashed border-(--wr-muted)"
              }`}
            >
              {known ? monthShort(key) : <span className="[&>span]:text-(--wr-muted)"><UnknownValue /></span>}
            </m.li>
          );
        })}
      </ul>
    </div>
  );
}
