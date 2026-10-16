"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, FileText } from "lucide-react";
import { Card, SectionHeader, SegmentedControl } from "@/components/primitives";
import { REPORT_ANCHOR } from "@/lib/copilot-nav";
import { cn } from "@/lib/cn";
import { SpendingDonut, type JarDonutDatum } from "./SpendingDonut";

type Direction = "expense" | "income";

export interface DonutSide {
  data: JarDonutDatum[];
  total: number;
  prevTotal: number;
}

/**
 * "Báo cáo thu chi" — a donut of the month's spend (or income) grouped by
 * category, with a Chi tiêu / Thu nhập toggle, a month-over-month badge in the
 * center, on-slice percentages, a legend, and a link to the detailed report. All
 * figures come from the deterministic engine (invariant #1). Section carries
 * `id={REPORT_ANCHOR}` so copilot `open-report` anchors here (H1).
 */
export function SpendingSection({
  expense,
  income,
  onOpenReport,
}: {
  expense: DonutSide;
  income: DonutSide;
  onOpenReport: () => void;
}) {
  const [direction, setDirection] = useState<Direction>("expense");
  const side = direction === "expense" ? expense : income;

  return (
    <section id={REPORT_ANCHOR} className="scroll-mt-4">
      <SectionHeader title="Báo cáo thu chi" />
      <Card className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="Loại báo cáo"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "expense", label: "Chi tiêu" },
            { value: "income", label: "Thu nhập" },
          ]}
        />

        <SpendingDonut
          data={side.data}
          height={220}
          legend
          showPercentLabels
          centerLabel={direction === "expense" ? "Đã tiêu" : "Đã nhận"}
          emptyLabel={direction === "expense" ? "Chưa có chi tiêu kỳ này." : "Chưa có thu nhập kỳ này."}
          centerBadge={
            <MomBadge current={side.total} prev={side.prevTotal} goodWhenDown={direction === "expense"} />
          }
        />

        <button
          type="button"
          onClick={onOpenReport}
          className="flex w-full items-center gap-3 rounded-row border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <FileText size={18} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">Xem chi tiết báo cáo</span>
            <span className="block text-xs text-muted">Breakdown theo hũ và danh mục</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
        </button>
      </Card>
    </section>
  );
}

/** Compact MoM pill for the donut center; "—" base when no prior period. */
function MomBadge({ current, prev, goodWhenDown }: { current: number; prev: number; goodWhenDown: boolean }) {
  if (prev <= 0) return <span className="text-[11px] text-muted">chưa có kỳ trước</span>;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const good = (up && !goodWhenDown) || (down && goodWhenDown);
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        up || down ? (good ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative") : "bg-surface-muted text-muted",
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}
