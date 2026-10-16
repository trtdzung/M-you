"use client";

import { useMemo } from "react";
import { Wallet, CreditCard, LineChart } from "lucide-react";
import { Card, SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { AllocationList } from "@/components/wealth/AllocationList";
import { HealthPanel } from "@/components/wealth/HealthPanel";
import { AccordionCard } from "@/components/common/AccordionCard";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { NetWorthTrendChart } from "@/components/charts/NetWorthTrendChart";
import { useFinancials } from "@/state/useFinancials";
import { financialHealth } from "@/domain/engine";

/**
 * Tài sản tab (Red Team C4 — the view component, mounted by `PfmTabHost`; the
 * route is a redirect stub). Health panel (first UI for the indicators) +
 * allocation accordions + net-worth trend. No NetWorthCard hero — the overview
 * cockpit already shows net worth, so the duplicate is removed.
 */
export function WealthView() {
  const { loading, error, financials, raw } = useFinancials();

  const { assets, liabilities } = useMemo(() => {
    const bd = financials?.networth.breakdown ?? [];
    return {
      assets: bd.filter((i) => i.kind === "asset"),
      liabilities: bd.filter((i) => i.kind === "liability"),
    };
  }, [financials]);

  const health = useMemo(
    () => (financials && raw ? financialHealth(financials.cashflow, raw.accounts, financials.networth) : null),
    [financials, raw],
  );

  return (
    <div>
      <div className="mb-4">
        <PeriodPicker />
      </div>

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-16" />
          <SkeletonCard className="h-16" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && financials && raw && health && (
        <div className="flex flex-col gap-5">
          <section>
            <SectionHeader title="Sức khỏe tài chính" subtitle="Chỉ số ước tính từ dữ liệu của bạn" />
            <HealthPanel health={health} />
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
            <AccordionCard icon={LineChart} label="Xu hướng giá trị ròng">
              {raw.snapshots.length > 1 ? (
                <NetWorthTrendChart snapshots={raw.snapshots} />
              ) : (
                <Empty title="Chưa đủ dữ liệu" description="Cần ít nhất 2 tháng để vẽ xu hướng." />
              )}
            </AccordionCard>
          </section>
        </div>
      )}
    </div>
  );
}
