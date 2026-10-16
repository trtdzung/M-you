import type { FinancialHealth, HealthIndicator } from "@/domain/engine";
import { SourceBadge } from "@/components/primitives";
import { StatTile } from "@/components/pfm/cockpit/StatTile";
import { formatVndCompact } from "@/lib/format";

/**
 * Financial-health 2×2 panel — the deep view behind the overview "Sức khỏe"
 * tile. Reuses the generic `StatTile` (Red Team G/DRY). Every indicator is
 * derived → badged "ước tính" (estimated, H1); uncomputable → "—" (invariant
 * #6); concentration surfaces "một phần chưa biết" when net worth has unvalued
 * assets (M4).
 */
export function HealthPanel({ health }: { health: FinancialHealth }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        label="Cầm cự"
        value={valueText(health.runwayMonths, (v) => `${v.toFixed(1)} tháng`)}
        band={health.runwayMonths.band}
        badge={<SourceBadge source="estimated" />}
      />
      <StatTile
        label="Thặng dư/tháng"
        value={valueText(health.surplus, (v) => formatVndCompact(v))}
        band={health.surplus.band}
        badge={<SourceBadge source="estimated" />}
      />
      <StatTile
        label="Chi thiết yếu"
        value={valueText(health.essentialCoverage, (v) => `${Math.round(v * 100)}%`)}
        band={health.essentialCoverage.band}
        badge={<SourceBadge source="estimated" />}
      />
      <StatTile
        label="Tập trung TS"
        value={valueText(health.concentration, (v) => `${Math.round(v * 100)}%`)}
        band={health.concentration.band}
        badge={<SourceBadge source="estimated" />}
        sub={health.concentration.hasUnknown ? "một phần chưa biết" : undefined}
      />
    </div>
  );
}

function valueText(indicator: HealthIndicator, fmt: (v: number) => string) {
  if (indicator.value === null) return <span className="text-muted">—</span>;
  return fmt(indicator.value);
}
