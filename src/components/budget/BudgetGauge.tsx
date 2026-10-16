import { cn } from "@/lib/cn";

/**
 * Half-circle budget gauge — a KPI-vs-target read of đã tiêu vs tổng hạn mức
 * (design-system.md phase 03). Custom SVG (lighter than Recharts for a
 * semicircle). Colour bands: <80% positive · 80–100% warning · >100% negative —
 * but colour is NEVER the only signal (the caller renders the % + amounts beside
 * it, and this carries an aria-label), per the a11y rule.
 *
 * `pct` is `spent / limit` in [0, ∞) or `null` when no jar has a set limit — a
 * genuinely unknown total that renders as a muted, unfilled track with a "chưa
 * đặt" reading, never a green 0% (invariant #6).
 */
export function BudgetGauge({
  pct,
  centerLabel,
  sublabel,
}: {
  pct: number | null;
  centerLabel: string;
  sublabel?: string;
}) {
  const known = pct !== null;
  const fill = known ? Math.min(100, Math.max(0, pct * 100)) : 0;
  const band = !known ? "muted" : pct > 1 ? "over" : pct >= 0.8 ? "near" : "ok";
  const stroke = {
    ok: "var(--color-positive)",
    near: "var(--color-warning)",
    over: "var(--color-negative)",
    muted: "var(--color-border)",
  }[band];

  const ariaLabel = known
    ? `Đã dùng ${Math.round(pct * 100)}% tổng hạn mức`
    : "Chưa đặt hạn mức cho hũ nào";

  return (
    <div className="flex flex-col items-center" role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 200 116" className="w-full max-w-[280px]" aria-hidden="true">
        {/* track */}
        <path
          d="M10 100 A90 90 0 0 1 190 100"
          fill="none"
          stroke="var(--color-surface-muted)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* fill */}
        {known && fill > 0 && (
          <path
            d="M10 100 A90 90 0 0 1 190 100"
            fill="none"
            stroke={stroke}
            strokeWidth={14}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${fill} 100`}
          />
        )}
        {/* 80% threshold marker */}
        {known && (
          <circle cx={100 + 90 * Math.cos(Math.PI * (1 - 0.8))} cy={100 - 90 * Math.sin(Math.PI * 0.8)} r={3} fill="var(--color-warning)" />
        )}
      </svg>
      <div className="-mt-10 flex flex-col items-center">
        <span
          className={cn(
            "text-3xl font-bold tabular-nums",
            band === "over" ? "text-negative" : band === "near" ? "text-warning" : band === "ok" ? "text-positive" : "text-muted",
          )}
        >
          {centerLabel}
        </span>
        {sublabel && <span className="mt-0.5 text-xs text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
