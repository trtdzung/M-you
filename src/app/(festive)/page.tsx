"use client";

import { useEffect, useState } from "react";
import { AnniversaryHero } from "@/components/home/AnniversaryHero";
import { HomeHeader } from "@/components/shell/HomeHeader";
import { AccountSummaryCard } from "@/components/home/AccountSummaryCard";
import { HomeQuickGrid } from "@/components/home/HomeQuickGrid";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { PromoCard } from "@/components/home/PromoCard";
import { HomeInsightWidget } from "@/components/home/HomeInsightWidget";
import { Empty } from "@/components/states";
import { usePersona, useProviders } from "@/providers/context";
import type { Providers } from "@/providers";

export default function HomePage() {
  const providers = useProviders();
  const { persona } = usePersona();
  const [result, setResult] = useState<{ provider: Providers; accounts: Awaited<ReturnType<Providers["listAccounts"]>>; error: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    providers.listAccounts().then(accounts => {
      if (active) setResult({ provider: providers, accounts, error: false });
    }).catch(() => {
      if (active) setResult({ provider: providers, accounts: [], error: true });
    });
    return () => { active = false; };
  }, [providers]);
  // Never show the previous customer's balance while the provider switches.
  const current = result?.provider === providers ? result : null;
  const primary = current?.accounts.find(a => a.type === "current") ?? null;

  return (
    <div>
      <HomeHeader notifications={9} />
      <AnniversaryHero />

      <div className="flex flex-col gap-4">
          <HomeInsightWidget />

          {!current || current.error || primary ? (
            <AccountSummaryCard
              key={persona.cif}
              tier={primary?.tier ?? persona.tier}
              maskedNumber={primary?.maskedNumber ?? "Tài khoản chính"}
              balance={primary?.balance ?? null}
              freshness={primary?.lastSyncedAt ?? null}
            />
          ) : (
            <div className="shadow-card rounded-[24px] bg-surface p-5">
              <Empty title="Chưa có tài khoản" description="Chưa có tài khoản nào để hiển thị." />
            </div>
          )}

          <HomeQuickGrid />

          <PromoCarousel
            inset
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
        </div>
    </div>
  );
}
