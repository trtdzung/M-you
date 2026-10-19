"use client";

import { m, useReducedMotionConfig } from "motion/react";
import { UNKNOWN_TEXT } from "@/domain/wrapped";
import { RECEIPT_MAX_ROWS, RECEIPT_UI } from "./wrapped-ui-copy";
import type { RecurringRow } from "./wrapped-visual-data-lists";

/**
 * The recurring payments as a paper receipt: a light track-tinted slip, one dashed-divided
 * row per series (label, optional category, yearly amount right-aligned), at most
 * `RECEIPT_MAX_ROWS` with the rest folded into one "+N khoản khác" row so it fits a
 * short screen, and a zig-zag torn edge drawn as a plain SVG shape. Amounts arrive already masked or
 * "Chưa rõ" from `recurringRows`. The exact yearly total stays in the frame's body
 * line and the hero below the receipt.
 */

const STAGGER_S = 0.07;
const TEETH = 16;
const TOOTH_W = 300 / TEETH;
const EDGE_H = 8;
/** Zig-zag along the bottom edge: top corners, then down/up per tooth. */
const EDGE_POINTS = [
  "0,0",
  "300,0",
  ...Array.from({ length: TEETH * 2 }, (_, i) => `${300 - (i + 1) * (TOOTH_W / 2)},${i % 2 === 0 ? EDGE_H : 0}`),
].join(" ");

export function RecurringReceiptVisual({ rows }: { rows: readonly RecurringRow[] }) {
  const reduced = useReducedMotionConfig();
  if (rows.length === 0) return null;
  const shown = rows.slice(0, RECEIPT_MAX_ROWS);
  const hidden = rows.length - shown.length;
  return (
    <div aria-hidden data-testid="recurring-receipt-visual" className="w-full">
      <ul className="rounded-t-xl bg-(--wr-track)/30 px-4 pt-2">
        {shown.map((row, i) => (
          <m.li
            key={row.rank}
            data-rank={row.rank}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 300, damping: 26 }}
            className="flex items-start justify-between gap-3 border-t border-dashed border-(--wr-track) py-2 first:border-t-0"
          >
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-base font-semibold leading-snug">{row.label}</p>
              {row.category && <p className="text-xs font-medium">{row.category}</p>}
            </div>
            {row.annualText === UNKNOWN_TEXT ? (
              // Unknown reads as muted, never as an amount (plan invariant 2).
              <p data-unknown className="shrink-0 text-right text-sm font-bold leading-snug text-(--wr-muted)">
                {row.annualText}
              </p>
            ) : (
              <p className="shrink-0 text-right text-sm font-bold tabular-nums leading-snug">{`${row.annualText}${RECEIPT_UI.perYear}`}</p>
            )}
          </m.li>
        ))}
        {hidden > 0 && (
          <li
            data-more
            className="border-t border-dashed border-(--wr-track) py-2.5 text-sm font-semibold"
          >
            {RECEIPT_UI.more(hidden)}
          </li>
        )}
      </ul>
      <svg viewBox={`0 0 300 ${EDGE_H}`} preserveAspectRatio="none" className="block h-2 w-full fill-(--wr-track)/30" aria-hidden>
        <polygon data-edge points={EDGE_POINTS} />
      </svg>
    </div>
  );
}
