"use client";

import { useMemo, useState } from "react";
import { ErrorState, SkeletonCard } from "@/components/states";
import { SpendingSection } from "@/components/report/SpendingSection";
import { SpendingReport } from "@/components/report/SpendingReport";
import { CashflowOverviewCard } from "@/components/cashflow/CashflowOverviewCard";
import { CashflowTrendCard } from "@/components/cashflow/CashflowTrendCard";
import { cashflowTrend } from "@/domain/engine";
import type { PfmTabId } from "./PfmTabs";
import { useInsights } from "@/state/useInsights";
import { currentMonthKey, DEMO_NOW } from "@/lib/demo-clock";

/**
 * Tổng quan — the current-month income/expense picture, in three sections:
 * "Tổng quan thu chi" (income/expense/net at a glance), "Báo cáo thu chi"
 * (spend-by-jar breakdown + detailed report), and "Biến động thu chi" (the
 * 6-month trend). Every number traces to the deterministic engine (invariant #1);
 * missing values render "—", never 0 (#6). Wealth/net-worth lives on its own tab.
 */
export function OverviewTab({ onNavigate: _onNavigate }: { onNavigate: (tab: PfmTabId) => void }) {
  // The overview is ALWAYS the current month, independent of any month selected
  // on the other tabs' shared PeriodPicker, so the picture stays consistent.
  const { loading, error, financials, transactions } = useInsights(currentMonthKey());
  const [reportOpen, setReportOpen] = useState(false);

  const monthKey = financials?.monthKey ?? currentMonthKey();
  const trend = useMemo(() => cashflowTrend(transactions, monthKey), [transactions, monthKey]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-4 pb-6">
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-40" />
      </div>
    );
  }
  if (error || !financials) return <ErrorState />;

  const { cashflow, prevCashflow } = financials;

  return (
    <div data-testid="cockpit-root" className="flex min-h-full flex-col gap-4 pb-6">
      <p className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">
        Thu chi · {currentMonthLabel()}
      </p>

      <CashflowOverviewCard cashflow={cashflow} prevCashflow={prevCashflow} />

      <SpendingSection
        lines={financials.jarBudget.lines}
        expense={cashflow.expense}
        prevExpense={prevCashflow.expense}
        onOpenReport={() => setReportOpen(true)}
      />

      <CashflowTrendCard trend={trend} cashflow={cashflow} prevCashflow={prevCashflow} />

      {reportOpen && <SpendingReport monthKey={monthKey} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

function currentMonthLabel(): string {
  return `Tháng ${DEMO_NOW.getUTCMonth() + 1}/${DEMO_NOW.getUTCFullYear()}`;
}
