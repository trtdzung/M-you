"use client";

import { m, useReducedMotionConfig } from "motion/react";
import { UnknownValue } from "@/components/states";
import { monthShort, ratioToMax } from "./wrapped-visual-data-spend";

/**
 * Month-by-month spend as bars whose HEIGHT is the ratio to the biggest month — a
 * shape, no readable amount: no axis, no tooltip, no SVG text. A month without
 * expense data is `"unknown"`: no bar, "—" under its label (never a zero bar). A
 * known 0 is a thin `--wr-muted` baseline tick (distinct from an unknown gap); the
 * other bars are `--wr-track`. The peak month is `--wr-accent` plus a
 * marker above it and a bold label (colour is never the only cue). While masked the
 * heights would still encode money, so nothing is drawn (invariant #5/D1).
 */

const WIDTH = 300;
const HEIGHT = 120;
const BASE = 116;
const MAX_BAR = 92;
const BAR_W = 26;
const TICK_H = 2;
const MARKER = 6;
const MIN_KNOWN_BARS = 2;
const STAGGER_S = 0.07;

const isKnown = (v: number | "unknown"): v is number => typeof v === "number" && Number.isFinite(v);

/** Whether the visual draws anything: never while masked, and only with >= 2 known months (no lone bar). */
export const hasSpendShape = (series: readonly (number | "unknown")[], masked: boolean): boolean =>
  !masked && series.filter(isKnown).length >= MIN_KNOWN_BARS;

export function TotalSpendVisual({
  series,
  monthKeys,
  masked,
}: {
  series: readonly (number | "unknown")[];
  monthKeys: readonly string[];
  masked: boolean;
}) {
  const reduced = useReducedMotionConfig();
  const ratios = ratioToMax(series);
  const known = series.filter(isKnown);
  // Masked, or too little to draw a shape from: show nothing rather than a lone bar.
  if (!hasSpendShape(series, masked)) return null;

  const max = Math.max(...known);
  // First of a tie, like the copy line. An all-zero series has no peak.
  const peakIndex = max > 0 ? series.findIndex((v) => v === max) : -1;
  const columns = series.length;
  const cx = (i: number) => ((i + 0.5) * WIDTH) / columns;

  return (
    <div aria-hidden data-testid="total-spend-visual" className="w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full overflow-visible" fill="none">
        {ratios.map((ratio, i) => {
          if (ratio === null) return null; // unknown month: a gap
          const peak = i === peakIndex;
          const x = cx(i) - BAR_W / 2;
          if (ratio === 0) {
            return (
              <rect key={monthKeys[i] ?? i} data-tick x={x} y={BASE - TICK_H} width={BAR_W} height={TICK_H} rx={1} className="fill-(--wr-muted)" />
            );
          }
          const top = BASE - ratio * MAX_BAR;
          return (
            <g key={monthKeys[i] ?? i}>
              <m.rect
                data-bar
                data-peak={peak ? "true" : undefined}
                x={x}
                y={BASE - MAX_BAR}
                width={BAR_W}
                height={MAX_BAR}
                rx={4}
                className={peak ? "fill-(--wr-accent)" : "fill-(--wr-track)"}
                style={{ originY: 1 }}
                initial={reduced ? false : { scaleY: 0 }}
                animate={{ scaleY: ratio }}
                transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 180, damping: 22 }}
              />
              {peak && (
                <m.path
                  data-marker
                  d={`M${cx(i) - MARKER} ${top - MARKER - 4} L${cx(i) + MARKER} ${top - MARKER - 4} L${cx(i)} ${top - 4} Z`}
                  className="fill-(--wr-accent)"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * STAGGER_S + 0.25 }}
                />
              )}
            </g>
          );
        })}
      </svg>
      <ul
        className="mt-2 grid text-xs"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {series.map((v, i) => (
          <li key={monthKeys[i] ?? i} className="flex flex-col items-center gap-0.5">
            <span className={i === peakIndex ? "font-extrabold" : "font-medium"}>
              {monthKeys[i] ? monthShort(monthKeys[i]) : ""}
            </span>
            {!isKnown(v) ? (
              <span className="[&>span]:text-(--wr-muted)">
                <UnknownValue />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
