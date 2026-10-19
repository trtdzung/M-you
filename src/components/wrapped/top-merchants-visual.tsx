"use client";

import { m, useReducedMotionConfig } from "motion/react";
import { UnknownValue } from "@/components/states";
import { MERCHANT_UI } from "./wrapped-ui-copy";
import type { MerchantRow } from "./wrapped-visual-data-lists";

/**
 * Where the user goes most, as a ranked list: rank, monogram tile (`--wr-surface` on `--wr-accent`, 5.18:1), name (one line),
 * visits at title size with a bar proportional to the busiest merchant, and the spend
 * caption. Visits are counts, so the bars stay while amounts are masked; the spend
 * caption is already masked upstream. Unknown visits read "—" with no bar (never 0).
 */

const STAGGER_S = 0.07;

export function TopMerchantsVisual({
  rows,
  top3Share,
}: {
  rows: readonly MerchantRow[];
  /** Formatted share of visits held by the top three, or null when unknown (caption omitted). */
  top3Share: string | null;
}) {
  const reduced = useReducedMotionConfig();
  if (rows.length === 0) return null;
  return (
    <div aria-hidden data-testid="top-merchants-visual" className="flex w-full flex-col gap-3">
      <ol className="flex flex-col gap-4">
        {rows.map((row, i) => (
          <m.li
            key={row.rank}
            data-rank={row.rank}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 300, damping: 26 }}
            className="flex items-center gap-3"
          >
            <span className="w-6 shrink-0 text-sm font-bold tabular-nums">#{row.rank}</span>
            <span
              data-monogram
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--wr-accent) text-lg font-extrabold text-(--wr-surface)"
            >
              {row.monogram}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-base font-bold leading-tight">{row.name}</p>
              <div className="h-2 w-full rounded-full bg-(--wr-track)">
                {row.barRatio !== null && (
                  <m.span
                    data-bar
                    className="block h-full w-full rounded-full bg-(--wr-accent)"
                    style={{ originX: 0 }}
                    initial={reduced ? false : { scaleX: 0 }}
                    animate={{ scaleX: row.barRatio }}
                    transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 160, damping: 22 }}
                  />
                )}
              </div>
              <p className="text-xs font-medium [overflow-wrap:anywhere]">{row.spendText}</p>
            </div>
            <p className="flex shrink-0 items-baseline gap-1 font-extrabold tabular-nums leading-none">
              {row.visits === null ? (
                <span className="text-[2rem] [&>span]:text-(--wr-muted)">
                  <UnknownValue />
                </span>
              ) : (
                <>
                  <span className="text-[2rem]">{row.visitsText}</span>
                  <span className="text-sm font-semibold">{MERCHANT_UI.visits}</span>
                </>
              )}
            </p>
          </m.li>
        ))}
      </ol>
      {top3Share && <p className="text-sm font-medium">{MERCHANT_UI.top3Caption(top3Share)}</p>}
    </div>
  );
}
