import type { ReactNode } from "react";
import { Money } from "@/components/primitives";
import type { MaybeAmount } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Shared pressure row: label + status badge + progress bar + used/denominator
 * line. Consumed by both the per-category `BudgetList` and the jar cards so the
 * two altitudes render identically (H3, DRY). Presentation-only — every number
 * arrives already computed by the engine.
 *
 * `variant` drives the colour. `"unknown"`/`"neutral"` render a muted, unfilled
 * bar and no status badge, so an unresolved income basis can NEVER paint a green
 * "ok" bar over real overspend (Red Team C1).
 */
export type PressureVariant = "ok" | "near" | "over" | "unknown" | "neutral";

const VARIANT: Record<PressureVariant, { bar: string; text: string }> = {
  ok: { bar: "bg-positive", text: "text-positive" },
  near: { bar: "bg-warning", text: "text-warning" },
  over: { bar: "bg-negative", text: "text-negative" },
  unknown: { bar: "", text: "text-muted" },
  neutral: { bar: "", text: "text-muted" },
};

export function PressureRow({
  label,
  used,
  limit,
  pct,
  variant,
  statusLabel,
  rightLabel,
  limitLabel,
  usedPrefix,
  limitSuffix,
  accent,
}: {
  label: string;
  used: MaybeAmount;
  /** Denominator; null renders `limitLabel` (or nothing) instead of a Money value. */
  limit: MaybeAmount | null;
  /** 0..1 usage ratio; null renders an unfilled (muted) bar. */
  pct: number | null;
  variant: PressureVariant;
  statusLabel?: string;
  /** Right-hand footer slot (e.g. days-left); omit to hide. */
  rightLabel?: string | null;
  /** Denominator label when `limit` is null (e.g. "chưa xác định TN"). */
  limitLabel?: string;
  /** Text before the used amount (e.g. "Đã chi "). */
  usedPrefix?: string;
  /** Text after the Money denominator (e.g. " hạn mức"). */
  limitSuffix?: string;
  /** Optional colour-dot node before the label (jar palette, M9). */
  accent?: ReactNode;
}) {
  const style = VARIANT[variant];
  const fill = pct === null ? null : Math.min(100, Math.max(0, Math.round(pct * 100)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-text">
          {accent}
          {label}
        </span>
        {statusLabel && <span className={cn("text-xs font-medium", style.text)}>{statusLabel}</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        {fill !== null && (
          <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${fill}%` }} />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted">
        <span>
          {usedPrefix}
          <Money amount={used} className="text-text" />
          {limit !== null ? (
            <>
              {" / "}
              <Money amount={limit} />
              {limitSuffix}
            </>
          ) : limitLabel ? (
            <> / {limitLabel}</>
          ) : null}
        </span>
        {rightLabel && <span>{rightLabel}</span>}
      </div>
    </div>
  );
}
