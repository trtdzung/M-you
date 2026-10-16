"use client";

import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, Freshness, Money, SectionHeader, SourceBadge, Stat } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { NetWorthCard } from "@/components/wealth/NetWorthCard";
import { ObligationsList } from "@/components/overview/ObligationsList";
import { PfmHubNav } from "@/components/pfm/PfmHubNav";
import { useFinancials } from "@/state/useFinancials";
import { monthKeyLabel } from "@/lib/demo-clock";

/**
 * PFM hub landing: giá trị ròng + dòng tiền tháng + "Sắp phải trả" (obligations —
 * Red Team #3, đích cố định tại đây) + điều hướng tới Dòng tiền/Tài sản/Gợi ý.
 */
export default function PfmHubPage() {
  const { loading, error, financials } = useFinancials();

  return (
    <div>
      <ScreenHeader title="PFM" subtitle="Bức tranh tài chính của bạn" />
      <div className="mb-4">
        <PeriodPicker />
      </div>

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-28" />
          <SkeletonCard className="h-56" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && financials && (
        <div className="flex flex-col gap-5">
          <NetWorthCard networth={financials.networth} />

          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <Stat
                label={`Dòng tiền · ${monthKeyLabel(financials.monthKey)}`}
                value={<Money amount={financials.cashflow.net} sign={financials.cashflow.net >= 0 ? "credit" : "debit"} />}
              />
              <DeltaBadge current={financials.cashflow.net} previous={financials.prevCashflow.net} />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <Stat label="Thu nhập" value={<Money amount={financials.cashflow.income} className="text-positive" />} />
              <Stat label="Chi tiêu" value={<Money amount={financials.cashflow.expense} className="text-negative" />} />
            </div>
            <div className="mt-3">
              <Freshness at={financials.cashflow.meta.freshness} />
            </div>
          </Card>

          <section>
            <SectionHeader title="Sắp phải trả" subtitle="Trong 30 ngày tới" action={<SourceBadge source="self_reported" />} />
            <Card>
              {financials.obligations.length > 0 ? (
                <ObligationsList items={financials.obligations} />
              ) : (
                <Empty title="Không có khoản sắp tới" description="Không có thanh toán nào trong 30 ngày." />
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Khám phá" subtitle="Đi sâu vào từng phần" />
            <PfmHubNav />
          </section>
        </div>
      )}
    </div>
  );
}
