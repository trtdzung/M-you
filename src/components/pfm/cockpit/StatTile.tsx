import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Generic, presentational KPI tile — a label, a value, and optional sub-line /
 * provenance-badge slot. Deliberately free of PFM logic and fixed sizing so both
 * the cockpit 2×2 grid (Phase 03) and the wealth health panel (Phase 07) reuse
 * it without retrofit (Red Team G). Renders as a button only when `onTap` is set.
 */
export function StatTile({
  label,
  value,
  sub,
  badge,
  band,
  onTap,
  ariaLabel,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Provenance / source badge slot. */
  badge?: ReactNode;
  /** Optional qualitative accent. */
  band?: "good" | "warn" | "bad" | null;
  onTap?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  const bandColor =
    band === "good" ? "text-positive" : band === "warn" ? "text-warning" : band === "bad" ? "text-negative" : "text-text";

  const inner = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[12px] font-medium text-muted">{label}</span>
        {badge}
      </div>
      <span className={cn("mt-1 block truncate text-lg font-bold leading-tight", bandColor)}>{value}</span>
      {sub && <span className="mt-0.5 block truncate text-[11px] text-muted">{sub}</span>}
    </>
  );

  const base = "shadow-card block w-full rounded-[20px] bg-surface p-3 text-left";

  if (onTap) {
    return (
      <button
        type="button"
        onClick={onTap}
        aria-label={ariaLabel ?? label}
        className={cn(base, "min-h-[72px] transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", className)}
      >
        {inner}
      </button>
    );
  }

  return <div className={cn(base, className)}>{inner}</div>;
}
