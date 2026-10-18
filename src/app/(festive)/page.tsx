"use client";

import { useMemo } from "react";
import { AnniversaryHero } from "@/components/home/AnniversaryHero";
import { HomeHeader } from "@/components/shell/HomeHeader";
import { AccountSummaryCard } from "@/components/home/AccountSummaryCard";
import { HomeQuickGrid } from "@/components/home/HomeQuickGrid";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { PromoCard } from "@/components/home/PromoCard";
import { HomeInsightWidget } from "@/components/home/HomeInsightWidget";
import { Empty, ErrorState, SkeletonCard } from "@/components/states";
import { useFinancials } from "@/state/useFinancials";

export default function HomePage() {
  const { loading, error, raw } = useFinancials();

  const primary = useMemo(
    () => raw?.accounts.find((a) => a.type === "current") ?? null,
    [raw],
  );

  return (
    <div>
      <HomeHeader notifications={9} />
      <AnniversaryHero />

      {loading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard className="h-32" />
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-28" />
        </div>
      )}

      {error && <ErrorState />}

      {!loading && !error && (
        <div className="flex flex-col gap-4">

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
                key="savings"
                variant="image"
                image="/brand/banner-savings.jpg"
                imageAlt="Cùng tài khoản MSB sinh lời không ngừng, lên tới 5,8%/năm"
              />,
              <PromoCard
                key="business"
                variant="image"
                image="/brand/banner-business.jpg"
                imageAlt="Từ hộ nhỏ hôm nay, vươn tầm doanh nghiệp ngày mai"
              />,
              <PromoCard
                key="family"
                variant="image"
                image="/brand/banner-family.jpg"
                imageAlt="Thẻ MSB Mastercard Family hoàn tiền tới 30%"
              />,
            ]}
          />
          <HomeInsightWidget />
        </div>
      )}
    </div>
  );
}
