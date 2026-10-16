import { ChevronRight } from "lucide-react";
import type { NetWorthResult, NetWorthTrendMeta } from "@/domain/engine";
import { SourceBadge } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { formatVndCompact } from "@/lib/format";
import { Sparkline } from "./Sparkline";

/**
 * Compact cockpit hero for net worth. Uses the existing `DeltaBadge` fed raw
 * current/previous snapshot values (Red Team C3 — no reinvented delta object),
 * a hand-rolled sparkline, and TWO distinct provenance signals (Red Team H1/H2):
 * `SourceBadge(seriesMeta.source)` for the trend and `hasUnknown` for current
 * completeness. Tapping navigates to the Tài sản tab.
 */
export function HeroNetWorth({
  networth,
  current,
  previous,
  series,
  seriesMeta,
  onTap,
}: {
  networth: NetWorthResult;
  current: number | null;
  previous: number | null;
  series: number[];
  seriesMeta: NetWorthTrendMeta;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label="Xem Tài sản"
      className="brand-gradient shadow-card flex w-full items-center gap-3 rounded-[24px] px-4 py-3 text-left text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-primary-fg/80">Tài sản ròng</span>
          {seriesMeta.source && <SourceBadge source={seriesMeta.source} />}
        </div>
        <div className="mt-0.5 truncate text-2xl font-bold tabular-nums">
          {formatVndCompact(networth.total)}
        </div>
        <div className="mt-1 flex items-center gap-2 overflow-hidden">
          {current !== null && previous !== null ? (
            <DeltaBadge current={current} previous={previous} className="shrink-0 text-primary-fg/90" />
          ) : (
            <span className="shrink-0 text-xs text-primary-fg/70">Chưa đủ dữ liệu xu hướng</span>
          )}
          {networth.hasUnknown && (
            <span className="truncate text-[11px] text-primary-fg/70">· một phần chưa biết</span>
          )}
        </div>
      </div>
      {series.length >= 2 && <Sparkline values={series} className="shrink-0 opacity-90" />}
      <ChevronRight size={20} className="shrink-0 text-primary-fg/70" />
    </button>
  );
}
