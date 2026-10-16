"use client";

import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * iOS-style segmented control — the single toggle language across the PFM
 * surface (Báo cáo Chi tiêu/Thu nhập, khoảng thời gian Biến động, segment
 * Chi/Thu ở Ngân sách). A pill track on `surface-muted` with equal-width
 * segments; the selected one lifts onto a white `surface` with `shadow-card`.
 * Presentation only — renders a `tablist` of `tab`s with `aria-selected`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-1 rounded-full bg-surface-muted p-1", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-9 flex-1 rounded-full px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              selected ? "bg-surface text-primary shadow-card" : "text-muted hover:text-text",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
