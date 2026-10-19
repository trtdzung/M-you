import { m } from "motion/react";
import { CHROME } from "./wrapped-chrome-classes";
import type { WrappedThemeMode } from "./wrapped-slide-themes";

/**
 * Story progress segments: one per slide, filled up to and including the current
 * one. Past segments are static fills; the current one fills left to right (scaleX)
 * when it becomes current. Track/fill colours follow the current slide's theme mode. Purely visual (`aria-hidden`) — the viewer's live region
 * announces "Trang i/n".
 */
export function WrappedProgressBars({ count, index, mode }: { count: number; index: number; mode: WrappedThemeMode }) {
  const { track, fill } = CHROME[mode];
  return (
    <div aria-hidden data-testid="wrapped-progress" className="flex gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          data-filled={i <= index}
          className={`relative h-1 flex-1 overflow-hidden rounded-pill ${track}`}
        >
          {i < index && <span className={`absolute inset-0 ${fill}`} />}
          {i === index && (
            <m.span
              className={`absolute inset-0 origin-left ${fill}`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          )}
        </span>
      ))}
    </div>
  );
}
