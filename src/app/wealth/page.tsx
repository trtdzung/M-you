"use client";

import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, Loading } from "@/components/states";
import { NetWorthCard } from "@/components/wealth/NetWorthCard";
import { AllocationList } from "@/components/wealth/AllocationList";
import { NetWorthTrendChart } from "@/components/charts/NetWorthTrendChart";
import { useFinancials } from "@/state/useFinancials";

export default function WealthPage() {
  const { loading, error, financials, raw } = useFinancials();

  return (
    <div>
      <ScreenHeader title="Tài sản" subtitle="Bức tranh tài sản & nợ" />

      {loading && <Loading />}
      {error && <ErrorState />}

      {!loading && !error && financials && raw && (
        <div className="flex flex-col gap-6">
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

          <section>
            <SectionHeader title="Phân bổ" subtitle="Tài sản và khoản nợ" />
            <Card>
              {financials.networth.breakdown.length > 0 ? (
                <AllocationList items={financials.networth.breakdown} />
              ) : (
                <Empty title="Chưa có tài sản/nợ" description="Thêm dữ liệu để xem phân bổ." />
              )}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
