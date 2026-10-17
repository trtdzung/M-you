"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { AllocationSheet } from "@/components/hu-envelope/AllocationSheet";
import { useFinancials } from "@/state/useFinancials";
import { useJarConfig } from "@/state/jars";
import { currentMonthKey } from "@/lib/demo-clock";
import { BudgetSummaryCard } from "./BudgetSummaryCard";
import { HuBudgetCard } from "./HuBudgetCard";

/**
 * Ngân sách tab (BIDV wallet model): a total gauge (đã tiêu vs tổng hạn mức) + a
 * card per jar with progress + ⚠ warnings. Every number comes from
 * `financials.jarBudget` (engine, phase 02) — the tab only presents. Jars with an
 * unset limit are listed separately (never counted in the gauge). Income was
 * removed — the tab is spending-only (no Thu segment).
 *
 * A failed jar load (`useJarConfig().error`, U10) renders an error state — never
 * the "Chưa có hũ nào" empty state, which would misreport the user's jars.
 *
 * Each card shows "Đã chi / hạn mức" for the picked month and the jar's running
 * SỐ DƯ (a month before the jar existed → "Chưa có số dư"). Funding actions
 * ("Nạp thêm vào hũ", "Chia ngay" → `AllocationSheet`) exist ONLY for the current
 * month: "Chờ phân bổ" is a current stock (Red Team #2).
 */
export function BudgetTab() {
  const { loading, error, financials } = useFinancials();
  const { config, error: jarError } = useJarConfig();
  const router = useRouter();
  const [coverOpen, setCoverOpen] = useState(false);

  function openEditor(huId: string) {
    router.replace(`/pfm?tab=settings&hu=${huId}`, { scroll: false });
  }
  function openSettings() {
    router.replace("/pfm?tab=settings", { scroll: false });
  }

  if (error) return <ErrorState />;
  if (jarError) {
    return <ErrorState title="Không tải được hũ chi tiêu" description="Không thể tải cấu hình hũ. Vui lòng thử lại sau." />;
  }
  if (loading || !financials) {
    return (
      <SkeletonScreen>
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
      </SkeletonScreen>
    );
  }

  const { lines, summary } = financials.jarBudget;
  const setLines = lines.filter((l) => l.limitState === "set");
  const unsetLines = lines.filter((l) => l.limitState === "unset");
  const isCurrentMonth = financials.monthKey === currentMonthKey();
  const openCover = isCurrentMonth ? () => setCoverOpen(true) : undefined;
  const cardProps = { onEdit: openEditor, onCover: openCover, onAllocate: openCover };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <PeriodPicker />
        <span className="shadow-card inline-flex min-h-[36px] items-center rounded-full bg-surface px-3 text-xs font-semibold text-muted">
          VND
        </span>
      </div>

      {lines.length === 0 ? (
        <Empty
          title="Chưa có hũ nào"
          description="Tạo hũ và đặt hạn mức để theo dõi chi tiêu theo nhóm."
          action={
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
            >
              <Plus size={16} aria-hidden /> Thêm hũ
            </button>
          }
        />
      ) : (
        <>
          <BudgetSummaryCard
            summary={summary}
            overAllocated={financials.unallocatedPool.overAllocated}
            source={financials.jarBudget.meta.sourceCoverage.sources[0] ?? "mock"}
          />

          <SectionHeader
            title="Hũ có hạn mức"
            action={
              <button
                type="button"
                onClick={openSettings}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Plus size={14} aria-hidden /> Thêm ngân sách
              </button>
            }
          />

          {setLines.length > 0 ? (
            <div className="flex flex-col gap-3">
              {setLines.map((line) => (
                <HuBudgetCard key={line.huId} line={line} {...cardProps} />
              ))}
            </div>
          ) : (
            <p className="px-1 text-sm text-muted">Chưa hũ nào có hạn mức. Đặt hạn mức để bật gauge tổng.</p>
          )}

          {unsetLines.length > 0 && (
            <>
              <SectionHeader title="Chưa đặt hạn mức" />
              <div className="flex flex-col gap-3">
                {unsetLines.map((line) => (
                  <HuBudgetCard key={line.huId} line={line} {...cardProps} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {coverOpen && isCurrentMonth && financials.jarEnvelope && (
        <AllocationSheet envelope={financials.jarEnvelope} jars={config.jars} onClose={() => setCoverOpen(false)} />
      )}
    </div>
  );
}
