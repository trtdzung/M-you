"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, SlidersHorizontal, PiggyBank } from "lucide-react";
import { Card, Freshness, Money, SectionHeader, SourceBadge } from "@/components/primitives";
import { Empty, ErrorState, InsufficientData, SkeletonCard, SkeletonScreen } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { AccordionCard } from "@/components/common/AccordionCard";
import { CashflowTrendChart } from "@/components/charts/CashflowTrendChart";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { FixedVsDiscretionary } from "@/components/cashflow/FixedVsDiscretionary";
import { BudgetList } from "@/components/budget/BudgetList";
import { JarList } from "@/components/jars/JarList";
import { useFinancials } from "@/state/useFinancials";
import { cashflowTrend } from "@/domain/engine";
import { monthKeyLabel } from "@/lib/demo-clock";

/**
 * Dòng tiền tab (Red Team C4 — the view component, mounted by `PfmTabHost`; the
 * route is a redirect stub). Trend-primary + full category list + accordion
 * secondary. No ScreenHeader (host owns the title) and no lead net/thu/chi card
 * (that summary lives on the overview cockpit) — removing the duplication.
 */
export function CashflowView() {
  const { loading, error, financials, transactions } = useFinancials();

  const monthKey = financials?.monthKey ?? null;
  const trend = useMemo(
    () => (monthKey ? cashflowTrend(transactions, monthKey) : null),
    [transactions, monthKey],
  );

  return (
    <div>
      <div className="mb-4">
        <PeriodPicker />
      </div>

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-16" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && financials && trend && (
        <div className="flex flex-col gap-5">
          <section>
            <SectionHeader title="Xu hướng thu/chi" subtitle="6 tháng gần nhất" />
            <Card>
              <CashflowTrendChart points={trend.points} />
              <div className="mt-2 flex items-center justify-between">
                <DeltaBadge current={financials.cashflow.net} previous={financials.prevCashflow.net} />
                <Freshness at={trend.meta.freshness} />
              </div>
              {financials.cashflow.pendingExpense > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Đang chờ xử lý:{" "}
                  <Money amount={financials.cashflow.pendingExpense} className="text-warning" /> (chưa tính vào tổng)
                </p>
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Chi theo danh mục" subtitle="Toàn bộ nhóm chi trong tháng" />
            <Card>
              {financials.categorySpend.length > 0 ? (
                <CategoryBars items={financials.categorySpend} />
              ) : (
                <Empty title="Chưa có chi tiêu" description="Chọn tháng khác để xem." />
              )}
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Chi tiết" subtitle="Ngân sách và cơ cấu chi" className="mb-0" action={<SourceBadge source="self_reported" />} />
            <AccordionCard icon={Wallet} label="Ngân sách tháng">
              {financials.budgetLines.length > 0 ? (
                <BudgetList lines={financials.budgetLines} />
              ) : (
                <Empty title="Chưa có ngân sách" description="Thiết lập hạn mức để theo dõi chi tiêu." />
              )}
            </AccordionCard>
            <AccordionCard icon={PiggyBank} label="Hũ chi tiêu">
              <div className="mb-3 flex items-center justify-end">
                <Link href="/pfm/jars" className="text-xs font-medium text-primary underline">
                  Thiết lập
                </Link>
              </div>
              <JarList
                partition={financials.jarPartition}
                periodLabel={monthKeyLabel(financials.monthKey)}
              />
            </AccordionCard>
            <AccordionCard icon={SlidersHorizontal} label="Cố định & linh hoạt">
              {financials.cashflow.expense > 0 ? (
                <FixedVsDiscretionary fixed={financials.cashflow.fixed} discretionary={financials.cashflow.discretionary} />
              ) : (
                <InsufficientData description="Chưa có chi tiêu trong tháng này." />
              )}
            </AccordionCard>
          </section>
        </div>
      )}
    </div>
  );
}
