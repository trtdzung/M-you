"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, TrendingUp, Wallet, Sparkles, Lightbulb, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { BrandHeader } from "@/components/shell/BrandHeader";
import { Card, Freshness, Money, SectionHeader, SourceBadge, Stat } from "@/components/primitives";
import { QuickActions, type QuickAction } from "@/components/common/QuickActions";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { ObligationsList } from "@/components/overview/ObligationsList";
import { InsightCard } from "@/components/insights/InsightCard";
import { useFinancials } from "@/state/useFinancials";
import { useInsightState } from "@/state/useInsights";
import { runDetectors } from "@/insights/run";
import { monthKeyLabel } from "@/lib/demo-clock";

const SHORTCUTS: QuickAction[] = [
  { label: "Giao dịch", icon: ArrowLeftRight, href: "/transactions" },
  { label: "Dòng tiền", icon: TrendingUp, href: "/cashflow" },
  { label: "Tài sản", icon: Wallet, href: "/wealth" },
  { label: "Trợ lý AI", icon: Sparkles, href: "/assistant" },
  { label: "Gợi ý", icon: Lightbulb, href: "#insights" },
  { label: "Quyền dữ liệu", icon: ShieldCheck, href: "/consent" },
];

export default function OverviewPage() {
  const { loading, error, financials, raw } = useFinancials();
  const [hideBalance, setHideBalance] = useState(false);
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
      {/* Dải gradient thương hiệu — chỉ mang logo/icon trắng (không chữ thường) */}
      <div className="brand-gradient -mx-4 -mt-1 rounded-b-[28px] px-4 pb-16 pt-1">
        <BrandHeader notifications={3} tone="light" />
      </div>

      {loading && (
        <SkeletonScreen className="-mt-12">
          <SkeletonCard className="h-28" />
          <SkeletonCard className="h-36" />
          <div className="grid grid-cols-2 gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && financials && raw && (
        <div className="flex flex-col gap-5">
          {/* Card trắng đè lên gradient — kiểu thẻ tài khoản MSB (mask + eye) */}
          <Card className="-mt-12">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Giá trị ròng</span>
              <SourceBadge source="self_reported" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              {hideBalance ? (
                <span className="text-3xl font-bold tracking-widest text-text">••••••••</span>
              ) : (
                <Money amount={financials.networth.total} className="text-3xl font-bold" />
              )}
              <button
                type="button"
                onClick={() => setHideBalance((v) => !v)}
                aria-label={hideBalance ? "Hiện số dư" : "Ẩn số dư"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {hideBalance ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="mt-3">
              <Freshness at={financials.networth.meta.freshness} />
            </div>
          </Card>

          <PeriodPicker />

          <QuickActions actions={SHORTCUTS} />

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
              <div className="mt-1 flex flex-col gap-0.5">
                <DeltaBadge current={financials.cashflow.net} previous={financials.prevCashflow.net} />
                <Freshness at={financials.cashflow.meta.freshness} />
              </div>
            </Card>
          </div>

          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Thu nhập" value={<Money amount={financials.cashflow.income} className="text-positive" />} />
              <Stat label="Chi tiêu" value={<Money amount={financials.cashflow.expense} className="text-negative" />} />
            </div>
            <div className="mt-3">
              <Freshness at={financials.cashflow.meta.freshness} />
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

          <section id="insights" className="scroll-mt-4">
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
