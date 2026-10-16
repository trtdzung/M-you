"use client";

import { useMemo } from "react";
import { ErrorState, SkeletonCard } from "@/components/states";
import { Freshness, SourceBadge } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { HeroNetWorth } from "./cockpit/HeroNetWorth";
import { StatTile } from "./cockpit/StatTile";
import { InsightStrip } from "./cockpit/InsightStrip";
import type { PfmTabId } from "./PfmTabs";
import { useInsights } from "@/state/useInsights";
import { SEVERITY_RANK } from "@/insights/types";
import { isUnknownAmount, formatVndCompact } from "@/lib/format";
import { lowestTrustSource, oldestFreshness } from "@/lib/provenance";
import { DEMO_NOW, currentMonthKey } from "@/lib/demo-clock";
import type { Amount } from "@/domain/engine";

/**
 * The no-scroll 4-Question Cockpit: hero net worth + 2×2 KPI grid + top-1
 * insight strip + worst-case provenance footer. CURRENT month only — no
 * PeriodPicker here (Red Team C2). Every number traces to an engine field;
 * missing values render "—", never 0 (invariant #6).
 */
export function OverviewTab({ onNavigate }: { onNavigate: (tab: PfmTabId) => void }) {
  // Red Team C2: the cockpit is ALWAYS the current month, independent of any
  // month selected on the other tabs' shared PeriodPicker. This keeps the
  // "Cuối tháng" projection valid (now == displayed month) and every tile
  // consistent, without a picker on this tab.
  const { loading, error, financials, visible } = useInsights(currentMonthKey());

  const topInsight = useMemo(
    () => [...visible].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0] ?? null,
    [visible],
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <SkeletonCard className="h-24" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonCard className="h-[72px]" />
          <SkeletonCard className="h-[72px]" />
          <SkeletonCard className="h-[72px]" />
          <SkeletonCard className="h-[72px]" />
        </div>
        <SkeletonCard className="h-16" />
      </div>
    );
  }
  if (error || !financials) return <ErrorState />;

  const { cashflow, prevCashflow, networth, obligations, endOfMonth, runway } = financials;
  const nextObligation = obligations[0];

  // Worst-case combined provenance across every tile (not just cashflow).
  const footerSource = lowestTrustSource([
    ...networth.meta.sourceCoverage.sources,
    ...cashflow.meta.sourceCoverage.sources,
    financials.networthSeriesMeta.source,
    endOfMonth.meta.source,
    runway.meta.source,
    nextObligation?.source,
  ]);
  const footerFreshness = oldestFreshness([
    cashflow.meta.freshness,
    networth.meta.freshness,
    financials.networthSeriesMeta.freshness,
    endOfMonth.meta.freshness,
    runway.meta.freshness,
  ]);

  return (
    <div
      data-testid="cockpit-root"
      className="flex h-full flex-col gap-2.5 overflow-hidden"
    >
      <HeroNetWorth
        networth={networth}
        current={financials.networthCurrent}
        previous={financials.networthPrevious}
        series={financials.networthSeries}
        seriesMeta={financials.networthSeriesMeta}
        onTap={() => onNavigate("wealth")}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Dòng tiền tháng"
          value={<CompactAmount value={cashflow.net} colorBySign />}
          sub={<DeltaBadge current={cashflow.net} previous={prevCashflow.net} />}
          onTap={() => onNavigate("cashflow")}
        />
        <StatTile
          label="Cuối tháng"
          value={<CompactAmount value={endOfMonth.value} />}
          badge={<SourceBadge source="estimated" />}
          onTap={() => onNavigate("cashflow")}
        />
        <StatTile
          label="Sắp phải trả"
          value={
            nextObligation ? (
              <CompactAmount value={nextObligation.amount} />
            ) : (
              <span className="text-muted">—</span>
            )
          }
          sub={
            nextObligation
              ? daysUntilLabel(nextObligation.dueDate)
              : "Không có khoản sắp tới"
          }
          onTap={() => onNavigate("cashflow")}
        />
        <StatTile
          label="Sức khỏe"
          value={
            runway.months === null ? (
              <span className="text-muted">—</span>
            ) : (
              `${runway.months.toFixed(1)} tháng`
            )
          }
          sub="Số tháng cầm cự"
          badge={<SourceBadge source="estimated" />}
          onTap={() => onNavigate("wealth")}
        />
      </div>

      {topInsight ? (
        <InsightStrip insight={topInsight} onTap={() => onNavigate("insights")} />
      ) : (
        <div className="shadow-card rounded-[20px] bg-surface p-3 text-center text-xs text-muted">
          Chưa có gợi ý mới
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 px-1 pt-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          Nguồn tổng hợp
          {footerSource && <SourceBadge source={footerSource} />}
        </span>
        <Freshness at={footerFreshness} className="text-[11px]" />
      </div>
    </div>
  );
}

/** Compact VND or "—" for unknown; optionally colors by sign. */
function CompactAmount({ value, colorBySign }: { value: Amount; colorBySign?: boolean }) {
  if (isUnknownAmount(value)) return <span className="text-muted">—</span>;
  const num = value as number;
  const color = colorBySign ? (num >= 0 ? "text-positive" : "text-negative") : "text-text";
  return <span className={color}>{formatVndCompact(num)}</span>;
}

function daysUntilLabel(dueDate: string): string {
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return "—";
  const days = Math.max(0, Math.ceil((due - DEMO_NOW.getTime()) / 86_400_000));
  if (days === 0) return "Hôm nay";
  return `Trong ${days} ngày`;
}
