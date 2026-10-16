"use client";

import { useMemo, useState } from "react";
import { ErrorState, SkeletonCard } from "@/components/states";
import { SpendingSection, type DonutSide } from "@/components/report/SpendingSection";
import { SpendingReport } from "@/components/report/SpendingReport";
import { CashflowOverviewCard } from "@/components/cashflow/CashflowOverviewCard";
import { CashflowTrendCard } from "@/components/cashflow/CashflowTrendCard";
import { HuOverviewRow } from "@/components/hu-envelope/HuOverviewRow";
import type { JarDonutDatum } from "@/components/report/SpendingDonut";
import { cashflowTrend } from "@/domain/engine";
import type { PfmTabId } from "./PfmTabs";
import { useInsights } from "@/state/useInsights";
import { currentMonthKey } from "@/lib/demo-clock";

/**
 * Tổng quan — the current-month spending picture in three sections: "Tổng quan
 * chi tiêu" (Chi tiêu bar), "Báo cáo chi tiêu" (donut + detailed report), and
 * "Biến động chi tiêu" (spend trend). Every number traces to the deterministic
 * engine (invariant #1); missing values render "—", never 0 (#6). Income was
 * removed — spending only. Wealth/net-worth lives on its own tab.
 */
export function OverviewTab({ onNavigate }: { onNavigate: (tab: PfmTabId) => void }) {
  // Always the current month, independent of any month picked on other tabs.
  const { loading, error, financials, transactions } = useInsights(currentMonthKey());
  const [reportOpen, setReportOpen] = useState(false);

  const monthKey = financials?.monthKey ?? currentMonthKey();
  // 12 months so the trend card can toggle two 6-month windows.
  const trend = useMemo(() => cashflowTrend(transactions, monthKey, 12), [transactions, monthKey]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-5 pb-6">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-64" />
      </div>
    );
  }
  if (error || !financials) return <ErrorState />;

  const { cashflow, prevCashflow } = financials;

  const expenseData: JarDonutDatum[] = financials.jarBudget.lines.map((l) => ({
    id: l.huId,
    label: l.label,
    amount: l.spent,
    colorKey: l.categoryIds[0] ?? l.huId,
  }));

  const expenseSide: DonutSide = {
    data: expenseData,
    total: cashflow.expense,
    prevTotal: prevCashflow.expense,
  };

  return (
    <div data-testid="cockpit-root" className="flex min-h-full flex-col gap-5 pb-6">
      <CashflowOverviewCard cashflow={cashflow} prevCashflow={prevCashflow} />

      <HuOverviewRow financials={financials} onNavigate={onNavigate} />

      <SpendingSection expense={expenseSide} onOpenReport={() => setReportOpen(true)} />

      <CashflowTrendCard trend={trend} />

      {reportOpen && <SpendingReport monthKey={monthKey} onClose={() => setReportOpen(false)} />}
    </div>
  );
}
