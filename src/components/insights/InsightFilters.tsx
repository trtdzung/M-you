"use client";

import type { InsightSeverity } from "@/insights/types";
import { cn } from "@/lib/cn";

export type InsightFilter = "all" | InsightSeverity;

export const INSIGHT_FILTERS: { id: InsightFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "urgent", label: "Cần chú ý" },
  { id: "attention", label: "Lưu ý" },
  { id: "info", label: "Thông tin" },
];

/** Severity filter chips with per-filter counts. Local-state driven. */
export function InsightFilters({
  active,
  counts,
  onChange,
}: {
  active: InsightFilter;
  counts: Record<InsightFilter, number>;
  onChange: (f: InsightFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo mức độ">
      {INSIGHT_FILTERS.map((f) => {
        const selected = f.id === active;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(f.id)}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              selected ? "bg-primary text-primary-fg" : "bg-surface text-muted shadow-card hover:text-text",
            )}
          >
            {f.label}
            <span className={cn("tabular-nums text-xs", selected ? "text-primary-fg/80" : "text-muted")}>
              {counts[f.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
