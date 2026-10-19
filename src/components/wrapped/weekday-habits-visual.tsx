"use client";

import { m, useReducedMotionConfig } from "motion/react";
import { UnknownValue } from "@/components/states";
import type { WeekdayColumn } from "./wrapped-visual-data-spend";

/**
 * Spend by weekday (T2..CN) as seven columns. Heights come from `weekdayColumns`: the
 * ratio to the busiest day, or — masked — identical for every known day, so no money
 * proportion is ever in the DOM. The peak day (the `peak-weekday` fact, never
 * recomputed here) is `--wr-accent` plus a marker and a bold label; the other
 * bars are `--wr-track`. Unknown day = a gap and "—"; known 0 = a `--wr-muted` baseline tick.
 */

const STAGGER_S = 0.07;

export function WeekdayHabitsVisual({ columns }: { columns: readonly WeekdayColumn[] }) {
  const reduced = useReducedMotionConfig();
  if (columns.length === 0) return null;
  return (
    <ul aria-hidden data-testid="weekday-habits-visual" className="grid w-full grid-cols-7 gap-2 pt-4">
      {columns.map((col, i) => (
        <li
          key={col.day}
          data-day={col.day}
          data-peak={col.peak ? "true" : undefined}
          className="flex flex-col items-center gap-1"
        >
          <div className={`relative h-32 w-full rounded-md ${col.weekend ? "bg-(--wr-track)/40" : ""}`}>
            {col.height !== null && col.height > 0 && (
              <m.div
                data-bar
                className={`absolute inset-x-0 bottom-0 h-full origin-bottom rounded-md ${col.peak ? "bg-(--wr-accent)" : "bg-(--wr-track)"}`}
                initial={reduced ? false : { scaleY: 0 }}
                animate={{ scaleY: col.height }}
                transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 180, damping: 22 }}
              />
            )}
            {col.height === 0 && <div data-tick className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-(--wr-muted)" />}
            {col.peak && col.height !== null && (
              <m.svg
                data-marker
                viewBox="0 0 12 8"
                className="absolute left-1/2 h-2 w-3 -translate-x-1/2 fill-(--wr-accent)"
                style={{ bottom: `calc(${col.height * 100}% + 4px)` }}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * STAGGER_S + 0.25 }}
              >
                <path d="M0 0 H12 L6 8 Z" />
              </m.svg>
            )}
          </div>
          <span className={`text-xs ${col.peak ? "font-extrabold" : "font-medium"}`}>{col.label}</span>
          {col.height === null && (
            <span className="[&>span]:text-(--wr-muted)">
              <UnknownValue />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
