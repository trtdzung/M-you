import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Labelled value block, e.g. a KPI on the Overview screen. */
export function Stat({
  label,
  value,
  hint,
  badge,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-lg font-semibold text-text">{value}</span>
      {(hint || badge) && (
        <span className="flex items-center gap-2 text-xs text-muted">
          {badge}
          {hint}
        </span>
      )}
    </div>
  );
}
