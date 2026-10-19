import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SURFACE_VARS } from "./wrapped-slide-themes";

/**
 * White r24 `shadow-card` surface. It re-scopes `--wr-ink` / `--wr-muted` to navy /
 * `#5f6775`, so whatever sits inside (visuals, body lines, footnote, CTA) reads the
 * same on a brand gradient slide and on a light slide. `data-wrapped-surface` is the
 * structural hook the frame-modes test uses.
 */
export function WrappedSurfaceCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-wrapped-surface
      style={SURFACE_VARS}
      className={cn(
        "flex flex-col gap-3 rounded-card bg-(--wr-surface) p-4 text-(--wr-ink) shadow-card [@media(max-height:700px)]:p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
