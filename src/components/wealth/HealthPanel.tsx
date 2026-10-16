// DEFERRED: unmounted in the 3-tab reformat — the financial-health UI is off the
// tab bar; engine (`financialHealth`) + tests kept, UI re-enabled later. See
// plans/260909-2254-pfm-3tab-reformat/ and plans/project-backlog.md.
import type { FinancialHealth, HealthIndicator } from "@/domain/engine";
import { SourceBadge } from "@/components/primitives";
import { StatTile } from "@/components/pfm/cockpit/StatTile";

/**
 * Financial-health panel — the deep view behind the overview "Sức khỏe" tile.
 * Reuses the generic `StatTile` (Red Team G/DRY). Every indicator is derived →
 * badged "ước tính" (estimated, H1); uncomputable → "—" (invariant #6);
 * concentration surfaces "một phần chưa biết" when net worth has unvalued assets
 * (M4). Income-derived indicators (surplus, essential coverage) were removed with
 * income — only the two income-free indicators remain.
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
