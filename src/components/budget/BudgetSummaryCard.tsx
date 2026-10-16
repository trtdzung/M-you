import { Card, Money, SourceBadge } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { JarBudgetSummary } from "@/domain/engine/jar-budget";
import type { DataSource } from "@/domain/models";
import { BudgetGauge } from "./BudgetGauge";

/**
 * Ngân sách header: gauge + Đã tiêu / Hạn mức / Còn lại|Vượt. Every figure is the
 * engine's `jarBudget.summary`. U22: rebalance legs to the pool / an unset or
 * deleted jar move `totalRemaining` without touching spend or limits, so the
 * header shows that net as an "Điều chỉnh hũ" line — the arithmetic always adds
 * up: Hạn mức − Đã tiêu + Điều chỉnh = Còn lại (or −Vượt).
 */
export function BudgetSummaryCard({
  summary,
  overAllocated,
  source,
}: {
  summary: JarBudgetSummary;
  overAllocated: boolean;
  source: DataSource;
}) {
  const pctLabel = summary.pctUsed !== null ? `${Math.round(summary.pctUsed * 100)}%` : "Chưa đặt";
  const remaining = summary.totalRemaining;
  const adjustment = summary.totalRebalanceNet ?? 0;
  return (
    <Card className="flex flex-col items-center gap-3" role="region" aria-label="Tổng ngân sách">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold text-text">Tổng đã tiêu</span>
        <div className="flex items-center gap-2">
          {overAllocated && (
            <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
              Vượt phân bổ
            </span>
          )}
          <SourceBadge source={source} />
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
          // A hũ holds money you put in — "còn lại" can't be negative. When the
          // total is below zero, show the overspend as "Vượt X" (positive figure).
          label={remaining !== null && remaining < 0 ? "Vượt" : "Còn lại"}
          node={
            remaining !== null ? (
              <Money
                amount={Math.abs(remaining)}
                className={cn("font-semibold", remaining < 0 ? "text-negative" : "text-text")}
              />
            ) : (
              <span className="text-muted">—</span>
            )
          }
        />
      </div>
      {remaining !== null && adjustment !== 0 && (
        <p className="w-full text-center text-[11px] text-muted" data-testid="budget-rebalance-adjustment">
          Điều chỉnh hũ {adjustment > 0 ? "+" : "−"}
          {formatVnd(Math.abs(adjustment))} (bù/chuyển với Chưa phân bổ hoặc hũ khác)
        </p>
      )}
    </Card>
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
