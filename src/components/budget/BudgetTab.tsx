"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { Card, Money, SectionHeader, SourceBadge } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { cn } from "@/lib/cn";
import { useFinancials } from "@/state/useFinancials";
import { BudgetGauge } from "./BudgetGauge";
import { HuBudgetCard } from "./HuBudgetCard";
import { makeJarLabelResolver } from "./JarRebalanceLines";

/**
 * Ngân sách tab (BIDV wallet model): a total gauge (đã tiêu vs tổng hạn mức) + a
 * card per jar with progress + ⚠ warnings. Every number comes from
 * `financials.jarBudget` (engine, phase 02) — the tab only presents. Jars with an
 * unset limit are listed separately (never counted in the gauge). Income was
 * removed — the tab is spending-only (no Thu segment).
 */
export function BudgetTab() {
  const { loading, error, financials } = useFinancials();
  const router = useRouter();

  function openEditor(huId: string) {
    router.replace(`/pfm?tab=settings&hu=${huId}`, { scroll: false });
  }
  function openSettings() {
    router.replace("/pfm?tab=settings", { scroll: false });
  }

  if (error) return <ErrorState />;
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
  const pctLabel = summary.pctUsed !== null ? `${Math.round(summary.pctUsed * 100)}%` : "Chưa đặt";
  // The period's inter-jar rebalance txns — rendered as read-only "cho/nhận"
  // pseudo-lines on each jar card (Phase 02). Same engine-excluded txns already
  // folded into every jar's `remaining`; `?? []` guards partial-`Financials` fixtures.
  const rebalances = financials.jarRebalances ?? [];
  const labelOf = makeJarLabelResolver(lines);

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
          <Card className="flex flex-col items-center gap-3" role="region" aria-label="Tổng ngân sách">
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-semibold text-text">Tổng đã tiêu</span>
              <div className="flex items-center gap-2">
                {financials.unallocatedPool.overAllocated && (
                  <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                    Vượt phân bổ
                  </span>
                )}
                <SourceBadge source={financials.jarBudget.meta.sourceCoverage.sources[0] ?? "mock"} />
              </div>
            </div>
            <BudgetGauge
              pct={summary.pctUsed}
              centerLabel={pctLabel}
              sublabel={summary.daysLeft > 0 ? `Còn ${summary.daysLeft} ngày trong kỳ` : "Đã hết kỳ"}
            />
            <div className="grid w-full grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <GaugeStat label="Đã tiêu" node={<Money amount={summary.totalSpentSet} className="font-semibold text-text" />} />
              <GaugeStat
                label="Hạn mức"
                node={summary.totalLimit !== null ? <Money amount={summary.totalLimit} className="font-semibold text-text" /> : <span className="text-muted">—</span>}
              />
              <GaugeStat
                // A hũ holds money you put in — "còn lại" can't be negative. When
                // spend exceeds the total limit, show the overspend as "Vượt X"
                // (a positive figure) instead of a nonsensical negative balance.
                label={summary.totalRemaining !== null && summary.totalRemaining < 0 ? "Vượt" : "Còn lại"}
                node={
                  summary.totalRemaining !== null ? (
                    <Money
                      amount={Math.abs(summary.totalRemaining)}
                      className={cn("font-semibold", summary.totalRemaining < 0 ? "text-negative" : "text-text")}
                    />
                  ) : (
                    <span className="text-muted">—</span>
                  )
                }
              />
            </div>
          </Card>

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
                <HuBudgetCard key={line.huId} line={line} onEdit={openEditor} rebalances={rebalances} labelOf={labelOf} />
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
                  <HuBudgetCard key={line.huId} line={line} onEdit={openEditor} rebalances={rebalances} labelOf={labelOf} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function GaugeStat({ label, node }: { label: string; node: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="text-sm">{node}</span>
    </div>
  );
}
