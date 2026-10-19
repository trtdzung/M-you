"use client";

import { useId } from "react";
import { m, useReducedMotionConfig } from "motion/react";
import { UnknownValue } from "@/components/states";
import type { JarRow } from "./wrapped-visual-data-spend";

/**
 * Where the money went, as up to four jars filled to their share. The fill is a
 * percentage (not money), so it stays visible while masked; the money caption goes
 * through the masking formatter upstream (`JarRow.amountText`). A jar with an unknown
 * share is an EMPTY outline with "—", never a fill of 0.
 * Width budget at 375px (319px of content): 4 jars sit in a 2x2 grid (cells ~153px,
 * jar beside its text), up to 3 in one row (cells ~98px, jar above its text).
 */

const JAR_BODY = "M14 14 Q6 20 6 32 V68 Q6 76 14 76 H46 Q54 76 54 68 V32 Q54 20 46 14 Z";
const JAR_LID = "M17 4 H43 V12 H17 Z";
// The liquid covers only the inner body (y 14..76), growing up from its bottom edge, so
// `scaleY` is the share of the body. The floor keeps a few px above the 3px stroke.
const BODY_TOP = 14;
const BODY_BOTTOM = 76;
const MIN_FILL = 0.08; // a positive share never vanishes
const STAGGER_S = 0.08;

const ROW_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

function Jar({ row, index, reduced, wide }: { row: JarRow; index: number; reduced: boolean | null; wide: boolean }) {
  const clipId = `jar-clip-${useId().replace(/:/g, "")}`;
  const known = row.share !== null;
  const fill = known ? Math.max(row.share! / 100, row.share! > 0 ? MIN_FILL : 0) : 0;
  return (
    <li className={`flex min-w-0 items-center gap-2 ${wide ? "flex-row" : "flex-col text-center"}`} data-jar={row.rank}>
      <svg viewBox="0 0 60 80" className="h-16 w-12 shrink-0" fill="none" aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <path d={JAR_BODY} />
          </clipPath>
        </defs>
        {known && fill > 0 && (
          <g clipPath={`url(#${clipId})`}>
            <m.rect
              data-liquid
              x={0}
              y={BODY_TOP}
              width={60}
              height={BODY_BOTTOM - BODY_TOP}
              className="fill-(--wr-accent)"
              style={{ originY: 1 }}
              initial={reduced ? false : { scaleY: 0 }}
              animate={{ scaleY: fill }}
              transition={{ delay: index * STAGGER_S, type: "spring", stiffness: 120, damping: 20 }}
            />
          </g>
        )}
        <path d={JAR_BODY} stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
        <path d={JAR_LID} stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
      </svg>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="line-clamp-2 text-balance text-sm font-semibold leading-tight">{row.label}</p>
        <p className="text-xl font-extrabold tabular-nums leading-tight">
          {known ? row.shareText : <span className="[&>span]:text-(--wr-muted)"><UnknownValue /></span>}
        </p>
        <p className="text-xs font-medium [overflow-wrap:anywhere]">{row.amountText}</p>
      </div>
    </li>
  );
}

export function JarFillVisual({ rows, fixedShare }: { rows: readonly JarRow[]; fixedShare: string | null }) {
  const reduced = useReducedMotionConfig();
  if (rows.length === 0) return null;
  const grid = rows.length >= 4;
  return (
    <div aria-hidden data-testid="jar-fill-visual" className="flex w-full flex-col gap-3">
      <ul
        data-layout={grid ? "grid" : "row"}
        className={`grid gap-3 ${grid ? "grid-cols-2" : (ROW_COLS[rows.length] ?? "grid-cols-3")}`}
      >
        {rows.map((row, i) => (
          <Jar key={row.rank} row={row} index={i} reduced={reduced} wide={grid} />
        ))}
      </ul>
      {fixedShare && <p className="text-sm font-medium">Chi cố định chiếm {fixedShare} tổng chi</p>}
    </div>
  );
}
