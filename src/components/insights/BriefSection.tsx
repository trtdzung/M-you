import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Section wrapper for the advisory Báo cáo — an icon + title header over a
 * vertical stack of items. Presentation only; every number rendered inside comes
 * from the deterministic brief composer (invariant #1).
 */
export function BriefSection({
  title,
  icon,
  count,
  children,
  className,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {count !== undefined && (
          <span className="text-xs font-medium text-muted">{count}</span>
        )}
      </div>
      <div className={cn("flex flex-col gap-2")}>{children}</div>
    </section>
  );
}
