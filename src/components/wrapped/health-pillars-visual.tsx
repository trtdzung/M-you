"use client";

import { m, useReducedMotionConfig } from "motion/react";
import { UnknownValue } from "@/components/states";
import { formatHealthScore, HEALTH_PILLAR_COPY, HEALTH_PILLARS, type WrappedSlide } from "@/domain/wrapped";

/**
 * The four health pillars as score meters (points, not money, so they stay while
 * masked). A pillar without a score is an empty track with "—", never a bar of 0 (#6).
 * Rows tighten on short screens (<=700px tall) so the health slide fits 375x667.
 */

const STAGGER_S = 0.08;

export interface HealthPillarRow {
  id: string;
  label: string;
  /** Points in [0, 100], or null when the engine could not score the pillar. */
  score: number | null;
}

export function healthPillarRows(slide: WrappedSlide): HealthPillarRow[] {
  return HEALTH_PILLARS.map((p) => {
    const v = slide.facts.find((f) => f.id === `health-pillar.${p}`)?.value;
    return { id: p, label: HEALTH_PILLAR_COPY[p], score: typeof v === "number" && Number.isFinite(v) ? v : null };
  });
}

/** Whether the visual draws anything: at least one pillar has a score. */
export const hasPillarScore = (rows: readonly HealthPillarRow[]): boolean => rows.some((r) => r.score !== null);

export function HealthPillarsVisual({ rows }: { rows: readonly HealthPillarRow[] }) {
  const reduced = useReducedMotionConfig();
  if (!hasPillarScore(rows)) return null;
  return (
    <ul aria-hidden data-testid="health-pillars-visual" className="flex w-full flex-col gap-3.5 [@media(max-height:700px)]:gap-2.5">
      {rows.map((row, i) => (
        <li key={row.id} data-pillar={row.id} className="flex flex-col gap-1.5 [@media(max-height:700px)]:gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">{row.label}</span>
            <span className="text-xl font-extrabold tabular-nums">
              {row.score === null ? (
                <span className="[&>span]:text-(--wr-muted)">
                  <UnknownValue />
                </span>
              ) : (
                formatHealthScore(row.score)
              )}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-(--wr-track)">
            {row.score !== null && (
              <m.span
                data-meter
                className="block h-full w-full rounded-full bg-(--wr-accent)"
                style={{ originX: 0 }}
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: Math.min(Math.max(row.score / 100, 0), 1) }}
                transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 140, damping: 22 }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
