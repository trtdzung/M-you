"use client";

import { useMemo } from "react";
import { Gift, Wallet } from "lucide-react";
import { HomeHeader } from "@/components/shell/HomeHeader";
import { BrandWatermark } from "@/components/shell/BrandWatermark";
import { AccountSummaryCard } from "@/components/home/AccountSummaryCard";
import { HomeQuickGrid } from "@/components/home/HomeQuickGrid";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { PromoCard } from "@/components/home/PromoCard";
import { InsightCard } from "@/components/insights/InsightCard";
import { Empty, ErrorState, SkeletonCard } from "@/components/states";
import { useFinancials } from "@/state/useFinancials";
import { useInsightState } from "@/state/useInsights";
import { runDetectors } from "@/insights/run";

/** Hero gradient + header + watermark — luôn hiển thị (kể cả khi loading). */
function Hero() {
  return (
    <div className="hero-gradient -mx-4 -mt-1 rounded-b-[32px] px-4 pb-28 pt-1">
      <HomeHeader notifications={9} />
      <div className="pointer-events-none flex justify-center pb-1 pt-10">
        <BrandWatermark className="w-52 opacity-90" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const { loading, error, financials, raw } = useFinancials();
  const insightState = useInsightState();

  const primary = useMemo(
    () => raw?.accounts.find((a) => a.type === "current") ?? null,
    [raw],
  );
  const topInsight = useMemo(
    () => (financials ? insightState.visibleOf(runDetectors(financials))[0] ?? null : null),
    [financials, insightState],
  );

  return (
    <div>
      <Hero />

      {loading && (
        <div className="-mt-20 flex flex-col gap-4">
          <SkeletonCard className="h-32" />
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-28" />
        </div>
      )}

      {error && (
        <div className="-mt-16">
          <ErrorState />
        </div>
      )}

      {!loading && !error && (
        <div className="-mt-20 flex flex-col gap-4">
          {primary ? (
            <AccountSummaryCard
              tier={primary.tier ?? "MSB"}
              maskedNumber={primary.maskedNumber}
              balance={primary.balance}
              freshness={primary.lastSyncedAt}
            />
          ) : (
            <div className="shadow-card rounded-[24px] bg-surface p-5">
              <Empty title="Chưa có tài khoản" description="Chưa có tài khoản nào để hiển thị." />
            </div>
          )}

          <HomeQuickGrid />

          <PromoCarousel
            items={[
              <PromoCard
                key="offer"
                icon={Gift}
                title="Ưu đãi dành riêng"
                body="Quý khách đã đủ điều kiện sử dụng dịch vụ ứng lương với hạn mức lên tới"
                highlight="75% hạn mức lương"
                cta="Tìm hiểu ngay"
              />,
              ...(topInsight
                ? [
                    <InsightCard
                      key={topInsight.id}
                      insight={topInsight}
                      actions={{
                        dismiss: insightState.dismiss,
                        snooze: insightState.snooze,
                        markHelpful: insightState.markHelpful,
                      }}
                    />,
                  ]
                : []),
              <PromoCard
                key="applepay"
                icon={Wallet}
                variant="banner"
                title="MSB Pay · Một chạm để thanh toán"
                body="Dễ dàng, an toàn và riêng tư."
              />,
            ]}
          />
        </div>
      )}
    </div>
  );
}
