"use client";

import { m, useReducedMotionConfig } from "motion/react";
import type { WrappedSlideId } from "@/domain/wrapped";
import type { WrappedRecapTile } from "./wrapped-deck-context";
import { RECAP_TITLE } from "./wrapped-ui-copy";

/**
 * The closing recap: each recapped slide's hero as a tile of a two-column bento (the
 * total spend is the wide lead tile). The tiles carry the hero strings the copy layer
 * already produced — masked money reads "•••" + "VND" — so this component has no mask
 * logic. Static digits (no count-up). A slide without a hero has no tile (never a 0).
 * Money tiles flag their value with `data-hero-money`.
 */

const MONEY_IDS: ReadonlySet<WrappedSlideId> = new Set<WrappedSlideId>(["total-spend", "recurring"]);
const STAGGER_S = 0.07;

export function ClosingRecapBento({ tiles }: { tiles: readonly WrappedRecapTile[] }) {
  const reduced = useReducedMotionConfig();
  if (tiles.length === 0) return null;
  const lead = tiles[0].id === "total-spend";
  // An odd tile left alone in the last row takes the full width.
  const rest = lead ? tiles.length - 1 : tiles.length;
  const orphan = rest % 2 === 1 ? tiles.length - 1 : -1;

  return (
    <div aria-hidden data-testid="closing-recap-bento" className="flex w-full flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide [@media(max-height:700px)]:hidden">{RECAP_TITLE}</p>
      <ul className="grid grid-cols-2 gap-2">
        {tiles.map(({ id, hero }, i) => {
          const wide = (lead && i === 0) || i === orphan;
          const text = id === "archetype";
          return (
            <m.li
              key={id}
              data-tile={id}
              initial={reduced ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * STAGGER_S, type: "spring", stiffness: 260, damping: 24 }}
              className={`flex min-w-0 flex-col justify-between gap-1 rounded-xl bg-(--wr-track)/30 px-3 py-1.5 ${wide ? "col-span-2" : ""}`}
            >
              <p
                data-hero-money={MONEY_IDS.has(id) ? "" : undefined}
                className={`flex flex-wrap items-baseline gap-x-1.5 font-extrabold leading-none ${text ? "text-lg leading-tight" : "tabular-nums"}`}
              >
                <span className={text ? "" : lead && i === 0 ? "text-[2.25rem]" : "text-[1.5rem]"}>{hero.value}</span>
                {hero.unit && <span className="text-sm">{hero.unit}</span>}
              </p>
              <p className="text-xs font-medium leading-tight">{hero.caption}</p>
            </m.li>
          );
        })}
      </ul>
    </div>
  );
}
