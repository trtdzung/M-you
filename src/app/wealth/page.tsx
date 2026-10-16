"use client";

import { useMemo } from "react";
import { Wallet, CreditCard } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { NetWorthCard } from "@/components/wealth/NetWorthCard";
import { AllocationList } from "@/components/wealth/AllocationList";
import { AccordionCard } from "@/components/common/AccordionCard";
import { NetWorthTrendChart } from "@/components/charts/NetWorthTrendChart";
import { useFinancials } from "@/state/useFinancials";

export default function WealthPage() {
  const { loading, error, financials, raw } = useFinancials();

  const { assets, liabilities } = useMemo(() => {
    const bd = financials?.networth.breakdown ?? [];
    return {
      assets: bd.filter((i) => i.kind === "asset"),
      liabilities: bd.filter((i) => i.kind === "liability"),
    };
  }, [financials]);

  return (
    <div>
      <ScreenHeader title="Tài sản" subtitle="Bức tranh tài sản & nợ" />

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-52" />
          <SkeletonCard className="h-16" />
          <SkeletonCard className="h-16" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && financials && raw && (
        <div className="flex flex-col gap-5">
          <NetWorthCard networth={financials.networth} />

          <section>
            <SectionHeader title="Xu hướng giá trị ròng" subtitle="6 tháng gần nhất" />
            <Card>
              {raw.snapshots.length > 1 ? (
                <NetWorthTrendChart snapshots={raw.snapshots} />
              ) : (
                <Empty title="Chưa đủ dữ liệu" description="Cần ít nhất 2 tháng để vẽ xu hướng." />
              )}
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Phân bổ" subtitle="Tài sản và khoản nợ" className="mb-0" />
            <AccordionCard icon={Wallet} label="Tài sản" defaultOpen>
              {assets.length > 0 ? (
                <AllocationList items={assets} />
              ) : (
                <Empty title="Chưa có tài sản" description="Thêm dữ liệu để xem phân bổ." />
              )}
            </AccordionCard>
            <AccordionCard icon={CreditCard} label="Khoản nợ">
              {liabilities.length > 0 ? (
                <AllocationList items={liabilities} />
              ) : (
                <Empty title="Chưa có khoản nợ" description="Bạn chưa khai báo khoản nợ nào." />
              )}
            </AccordionCard>
          </section>
        </div>
      )}
    </div>
  );
}
