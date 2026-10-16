"use client";

import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, Freshness, Money, SectionHeader, SourceBadge, Stat } from "@/components/primitives";
import { Empty, ErrorState, InsufficientData, SkeletonCard, SkeletonScreen } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { IncomeExpenseChart } from "@/components/charts/IncomeExpenseChart";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { FixedVsDiscretionary } from "@/components/cashflow/FixedVsDiscretionary";
import { BudgetList } from "@/components/budget/BudgetList";
import { useFinancials } from "@/state/useFinancials";

/**
 * Nội dung màn Dòng tiền (di dời vào PFM hub). Bao gồm ngân sách tháng (BudgetList
 * chuyển từ Giao dịch sang đây — Red Team #10). Tái dùng ở `/pfm/cashflow`.
 */
export function CashflowView() {
  const { loading, error, financials } = useFinancials();

  return (
    <div>
      <ScreenHeader title="Dòng tiền" subtitle="Thu, chi và ngân sách trong tháng" />
      <div className="mb-4">
        <PeriodPicker />
      </div>

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-32" />
          <SkeletonCard className="h-52" />
          <SkeletonCard className="h-40" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && financials && (
        <div className="flex flex-col gap-6">
          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <Stat label="Dòng tiền ròng" value={<Money amount={financials.cashflow.net} sign={financials.cashflow.net >= 0 ? "credit" : "debit"} />} />
              <DeltaBadge current={financials.cashflow.net} previous={financials.prevCashflow.net} />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <Stat label="Thu nhập" value={<Money amount={financials.cashflow.income} className="text-positive" />} />
              <Stat label="Chi tiêu" value={<Money amount={financials.cashflow.expense} className="text-negative" />} />
            </div>
            {financials.cashflow.pendingExpense > 0 && (
              <p className="mt-2 text-xs text-muted">
                Đang chờ xử lý: <Money amount={financials.cashflow.pendingExpense} className="text-warning" /> (chưa tính vào tổng)
              </p>
            )}
            <div className="mt-3 border-t border-border pt-3">
              <Freshness at={financials.cashflow.meta.freshness} />
            </div>
          </Card>

          <section>
            <SectionHeader title="Ngân sách tháng" subtitle="Mức chi so với hạn mức" action={<SourceBadge source="self_reported" />} />
            <Card>
              {financials.budgetLines.length > 0 ? (
                <BudgetList lines={financials.budgetLines} />
              ) : (
                <Empty title="Chưa có ngân sách" description="Thiết lập hạn mức để theo dõi chi tiêu." />
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Thu nhập & chi tiêu" />
            <Card>
              <IncomeExpenseChart income={financials.cashflow.income} expense={financials.cashflow.expense} />
              <div className="mt-2">
                <DeltaBadge current={financials.cashflow.expense} previous={financials.prevCashflow.expense} goodWhenDown />
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader title="Cố định & linh hoạt" subtitle="Chi tiêu bắt buộc so với tùy ý" />
            <Card>
              {financials.cashflow.expense > 0 ? (
                <FixedVsDiscretionary fixed={financials.cashflow.fixed} discretionary={financials.cashflow.discretionary} />
              ) : (
                <InsufficientData description="Chưa có chi tiêu trong tháng này." />
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Chi theo danh mục" subtitle="Nhóm chi tiêu lớn nhất" />
            <Card>
              {financials.categorySpend.length > 0 ? (
                <CategoryBars items={financials.categorySpend.slice(0, 6)} />
              ) : (
                <Empty title="Chưa có chi tiêu" description="Chọn tháng khác để xem." />
              )}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
