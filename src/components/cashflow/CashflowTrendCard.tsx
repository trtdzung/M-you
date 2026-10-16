"use client";

import { Card, Freshness, SectionHeader } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { CashflowTrendChart } from "@/components/charts/CashflowTrendChart";
import type { cashflowTrend, CashflowResult } from "@/domain/engine";

/**
 * "Biến động thu chi" — the 6-month income/expense trend from the engine's
 * `cashflowTrend` (invariant #1). The MoM delta on the current net gives the
 * headline movement; the chart shows its shape. Freshness declares the origin (#5).
 */
export function CashflowTrendCard({
  trend,
  cashflow,
  prevCashflow,
}: {
  trend: ReturnType<typeof cashflowTrend>;
  cashflow: CashflowResult;
  prevCashflow: CashflowResult;
}) {
  return (
    <section aria-label="Biến động thu chi">
      <SectionHeader
        title="Biến động thu chi"
        subtitle="6 tháng gần nhất"
        action={<Freshness at={trend.meta.freshness} className="text-[11px]" />}
      />
      <Card>
        <CashflowTrendChart points={trend.points} />
        <div className="mt-2">
          <DeltaBadge current={cashflow.net} previous={prevCashflow.net} />
        </div>
      </Card>
    </section>
  );
}
