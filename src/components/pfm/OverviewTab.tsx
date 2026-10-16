"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ErrorState, SkeletonCard, UnknownValue } from "@/components/states";
import { Freshness, Money, ProvenanceChip, Sheet, SourceBadge } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import type { NetWorthResult, Obligation } from "@/domain/engine";
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
 * The current-month overview: net worth + monthly situation + one priority
 * insight + worst-case provenance footer. The overview keeps its first glance
 * compact, but it is allowed to scroll when the viewport or text size needs
 * more room. Every number traces to an engine field; missing values render
 * "—", never 0 (invariant #6).
 */
export function OverviewTab({ onNavigate }: { onNavigate: (tab: PfmTabId) => void }) {
  // Red Team C2: the cockpit is ALWAYS the current month, independent of any
  // month selected on the other tabs' shared PeriodPicker. This keeps the
  // "Cuối tháng" projection valid (now == displayed month) and every tile
  // consistent, without a picker on this tab.
  const { loading, error, financials, visible } = useInsights(currentMonthKey());
  const router = useRouter();
  const [detail, setDetail] = useState<"projection" | "obligations" | "runway" | null>(null);

  const topInsight = useMemo(
    () => [...visible].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0] ?? null,
    [visible],
  );

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-3 pb-6">
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

  const { cashflow, prevCashflow, networth, obligations, endOfMonth, runway, health } = financials;
  const nextObligation = obligations[0];

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
      className="flex min-h-full flex-col gap-4 pb-6"
    >
      <p className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">
        Bức tranh hiện tại · {currentMonthLabel()}
      </p>
      <HeroNetWorth
        networth={networth}
        current={financials.networthCurrent}
        previous={financials.networthPrevious}
        series={financials.networthSeries}
        seriesMeta={financials.networthSeriesMeta}
        onTap={() => router.push("/pfm/wealth")}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Dòng tiền tháng này"
          value={<CompactAmount value={cashflow.net} colorBySign />}
          sub={<DeltaBadge current={cashflow.net} previous={prevCashflow.net} />}
          onTap={() => setDetail("projection")}
        />
        <StatTile
          label="Dự kiến cuối tháng"
          value={<CompactAmount value={endOfMonth.value} />}
          badge={<SourceBadge source="estimated" />}
          onTap={() => setDetail("obligations")}
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
          label="Khả năng trang trải"
          value={
            health.runwayMonths.value === null ? (
              <UnknownValue />
            ) : (
              `${health.runwayMonths.value.toFixed(1)} tháng`
            )
          }
          badge={<SourceBadge source={health.runwayMonths.source} />}
          onTap={() => setDetail("runway")}
        />
      </div>

      <NetWorthSummary networth={networth} />

      {topInsight ? (
        <InsightStrip insight={topInsight} onTap={() => router.push("/assistant")} />
      ) : (
        <div className="shadow-card rounded-[20px] bg-surface p-3 text-center text-xs text-muted">
          Chưa có gợi ý mới
        </div>
      )}

      <div className="flex items-center justify-end gap-2 px-1 pt-1 text-xs text-muted">
        <Freshness at={footerFreshness} />
      </div>

      {detail && <OverviewDetail detail={detail} financials={financials} onClose={() => setDetail(null)} />}
    </div>
  );
}

function OverviewDetail({
  detail,
  financials,
  onClose,
}: {
  detail: "projection" | "obligations" | "runway";
  financials: NonNullable<ReturnType<typeof useInsights>["financials"]>;
  onClose: () => void;
}) {
  if (detail === "projection") {
    return (
      <Sheet
        title="Dự kiến cuối tháng"
        description={`${currentMonthLabel()} · ước tính theo nhịp chi hiện tại`}
        onClose={onClose}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-surface-muted p-4">
            <p className="text-xs text-muted">Số dư thanh khoản dự kiến</p>
            <Money amount={financials.endOfMonth.value} className="mt-1 block text-2xl font-bold text-text" />
            <SourceBadge source={financials.endOfMonth.meta.source} className="mt-2" />
          </div>
          <p className="text-sm leading-6 text-muted">
            Gồm số dư hiện tại, thu nhập định kỳ, các khoản sắp phải trả và nhịp chi trong tháng.
          </p>
        </div>
      </Sheet>
    );
  }

  if (detail === "runway") {
    const months = financials.health.runwayMonths.value;
    return (
      <Sheet
        title="Khả năng trang trải"
        description="Số tháng số dư thanh khoản có thể trang trải theo mức chi hiện tại"
        onClose={onClose}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-surface-muted p-4">
            <p className="text-xs text-muted">Số tháng ước tính</p>
            {months === null ? (
              <p className="mt-1 text-2xl font-bold text-muted">Chưa đủ dữ liệu</p>
            ) : (
              <p className="mt-1 text-2xl font-bold text-text">{months.toFixed(1)} tháng</p>
            )}
            <SourceBadge source={financials.health.runwayMonths.source} className="mt-2" />
          </div>
          <p className="text-sm leading-6 text-muted">
            Số dư hiện tại đủ chi trong bao lâu theo mức chi trung bình. Chỉ để tham khảo, không phải số tiền dùng được ngay.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Sắp phải trả" description="Các khoản đến hạn trong 30 ngày tới" onClose={onClose}>
      {financials.obligations.length === 0 ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-muted">Chưa có khoản nào được ghi nhận trong 30 ngày tới.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl bg-surface-muted px-4">
          {financials.obligations.map((obligation) => (
            <li key={obligation.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{obligation.label}</p>
                <p className="mt-0.5 text-xs text-muted">{formatDueDate(obligation.dueDate)}</p>
              </div>
              <Money amount={obligation.amount} className="shrink-0 text-sm font-semibold text-text" />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/**
 * Folded P04 (red-team #14): a dense Tài sản & Nợ summary that decomposes the
 * hero net worth into assets vs liabilities from the composed `networth.breakdown`
 * (no new engine math) and drills into the `WealthManager` at /pfm/wealth in one
 * tap. Provenance chip on the row; a partly-unknown picture is flagged, never
 * shown as a false whole (#6). Kept to a single compact row so the first glance
 * stays calm even when the overview needs to scroll.
 */
function NetWorthSummary({ networth }: { networth: NetWorthResult }) {
  const source = lowestTrustSource(networth.meta.sourceCoverage.sources);
  return (
    <Link
      href="/pfm/wealth"
      aria-label="Mở Tài sản & Nợ"
      className="shadow-card flex items-center gap-3 rounded-[20px] bg-surface p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-muted">Tài sản &amp; Nợ</span>
          {source && <ProvenanceChip source={source} />}
          {networth.hasUnknown && <span className="text-[11px] text-muted">· một phần chưa biết</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px]">
          <span className="text-muted">Tài sản</span>
          <Money amount={networth.assetsTotal} className="font-semibold text-positive" />
          <span className="text-muted">· Nợ</span>
          <Money amount={networth.liabilitiesTotal} className="font-semibold text-negative" />
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
    </Link>
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

function currentMonthLabel(): string {
  return `Tháng ${DEMO_NOW.getUTCMonth() + 1}/${DEMO_NOW.getUTCFullYear()}`;
}

function formatDueDate(value: Obligation["dueDate"]): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ngày đến hạn chưa rõ";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
