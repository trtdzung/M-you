"use client";

import { useMemo } from "react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, Freshness, Money, SectionHeader, SourceBadge, Stat } from "@/components/primitives";
import { Empty, ErrorState, Loading } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { ObligationsList } from "@/components/overview/ObligationsList";
import { InsightCard } from "@/components/insights/InsightCard";
import { useFinancials } from "@/state/useFinancials";
import { useInsightState } from "@/state/useInsights";
import { runDetectors } from "@/insights/run";
import { monthKeyLabel } from "@/lib/demo-clock";

export default function OverviewPage() {
  const { loading, error, financials, raw } = useFinancials();
  const insightState = useInsightState();
  const topInsights = useMemo(
    () => (financials ? insightState.visibleOf(runDetectors(financials)).slice(0, 3) : []),
    [financials, insightState],
  );

  const cash = useMemo(() => {
    if (!raw) return { available: 0, freshness: null as string | null };
    const spend = raw.accounts.filter((a) => a.type !== "credit_card");
    return {
      available: spend.reduce((s, a) => s + a.availableBalance, 0),
      freshness: spend.reduce<string | null>((m, a) => (!m || a.lastSyncedAt > m ? a.lastSyncedAt : m), null),
    };
  }, [raw]);

  return (
    <div>
      <ScreenHeader title="Tổng quan" subtitle="Bức tranh tài chính của bạn" />
      <div className="mb-4">
        <PeriodPicker />
      </div>

      {loading && <Loading />}
      {error && <ErrorState />}

      {!loading && !error && financials && raw && (
        <div className="flex flex-col gap-6">
          <Card>
            <Stat
              label="Giá trị ròng"
              value={<Money amount={financials.networth.total} className="text-2xl" />}
              badge={<SourceBadge source="self_reported" />}
            />
            <div className="mt-2">
              <Freshness at={financials.networth.meta.freshness} />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <Stat label="Tiền khả dụng" value={<Money amount={cash.available} />} badge={<SourceBadge source="msb" />} />
              <div className="mt-1"><Freshness at={cash.freshness} /></div>
            </Card>
            <Card>
              <Stat
                label={`Dòng tiền · ${monthKeyLabel(financials.monthKey)}`}
                value={<Money amount={financials.cashflow.net} sign={financials.cashflow.net >= 0 ? "credit" : "debit"} />}
              />
              <div className="mt-1">
                <DeltaBadge current={financials.cashflow.net} previous={financials.prevCashflow.net} />
              </div>
            </Card>
          </div>

          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Thu nhập" value={<Money amount={financials.cashflow.income} className="text-positive" />} />
              <Stat label="Chi tiêu" value={<Money amount={financials.cashflow.expense} className="text-negative" />} />
            </div>
          </Card>

          <section>
            <SectionHeader title="Sắp phải trả" subtitle="Trong 30 ngày tới" />
            <Card>
              {financials.obligations.length > 0 ? (
                <ObligationsList items={financials.obligations} />
              ) : (
                <Empty title="Không có khoản sắp tới" description="Không có thanh toán nào trong 30 ngày." />
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Gợi ý" subtitle="Dựa trên quy tắc, tính từ dữ liệu của bạn" />
            {topInsights.length > 0 ? (
              <div className="flex flex-col gap-2">
                {topInsights.map((i) => (
                  <InsightCard
                    key={i.id}
                    insight={i}
                    actions={{ dismiss: insightState.dismiss, snooze: insightState.snooze, markHelpful: insightState.markHelpful }}
                  />
                ))}
              </div>
            ) : (
              <Empty title="Chưa có gợi ý" description="Chưa phát hiện điểm nào đáng chú ý trong tháng này." />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
