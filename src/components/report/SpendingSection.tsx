"use client";

import { ChevronRight, FileText } from "lucide-react";
import { Card, Freshness, SectionHeader } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { CashflowTrendChart } from "@/components/charts/CashflowTrendChart";
import { cashflowTrend } from "@/domain/engine";
import type { JarBudgetLine } from "@/domain/engine";
import { REPORT_ANCHOR } from "@/lib/copilot-nav";
import { SpendingDonut, type JarDonutDatum } from "./SpendingDonut";

/**
 * Chi tiêu tháng này nhóm theo hũ (trên Tổng quan): donut (đã tiêu) + MoM so kỳ
 * trước + xu hướng thu/chi 6 tháng + link mở báo cáo chi tiết. Số đã tiêu mỗi hũ
 * lấy từ `financials.jarBudget.lines` (engine phase 02); MoM tổng chi từ cashflow
 * so period — không bịa. Gộp nội dung Dòng tiền cũ vào Tổng quan (plan
 * 260910-1626). Section mang `id={REPORT_ANCHOR}` để copilot `open-report` neo
 * đúng chỗ (H1).
 */
export function SpendingSection({
  lines,
  expense,
  prevExpense,
  trend,
  onOpenReport,
}: {
  lines: JarBudgetLine[];
  expense: number;
  prevExpense: number;
  trend: ReturnType<typeof cashflowTrend>;
  onOpenReport: () => void;
}) {
  const data: JarDonutDatum[] = lines
    .filter((l) => l.spent > 0)
    .map((l) => ({ id: l.huId, label: l.label, amount: l.spent, colorKey: l.categoryIds[0] ?? l.huId }));

  return (
    <section id={REPORT_ANCHOR} className="scroll-mt-4">
      <SectionHeader title="Chi tiêu theo hũ" subtitle="Tháng này" />
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text">So với tháng trước</span>
          {prevExpense > 0 ? (
            <DeltaBadge current={expense} previous={prevExpense} goodWhenDown />
          ) : (
            <span className="text-xs text-muted">— chưa có kỳ trước</span>
          )}
        </div>

        <SpendingDonut data={data} height={190} legend />

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-text">Xu hướng thu/chi</span>
            <Freshness at={trend.meta.freshness} className="text-[11px]" />
          </div>
          <CashflowTrendChart points={trend.points} />
        </div>

        <button
          type="button"
          onClick={onOpenReport}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
