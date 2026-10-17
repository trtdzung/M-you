import { Card, Money, SourceBadge } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { JarBudgetSummary } from "@/domain/engine/jar-budget";
import type { DataSource } from "@/domain/models";
import { BudgetGauge } from "./BudgetGauge";

/**
 * Ngân sách header: gauge + Đã tiêu / Hạn mức (the monthly PLAN axis) and "Tổng số dư"
 * — Σ running balance of the funded jars (the MONEY axis, plan 260923; carried
 * across months, so it is NOT Hạn mức − Đã tiêu). A negative total reads in
 * `text-negative`; no funded jar → "—" (invariant #6). Every figure is the
 * engine's `jarBudget.summary`. U22: this month's inter-jar/pool rebalance net
 * is shown as an "Điều chỉnh hũ" line — it moves balances, never limits.
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
  const balance = summary.totalBalance;
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
          label="Tổng số dư"
          node={
            balance !== null ? (
              <Money amount={balance} className={cn("font-semibold", balance < 0 ? "text-negative" : "text-text")} />
            ) : (
              <span className="text-muted">—</span>
            )
          }
        />
      </div>
      {adjustment !== 0 && (
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
