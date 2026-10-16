"use client";

import { useState } from "react";
import { Card, Freshness, SectionHeader, SegmentedControl } from "@/components/primitives";
import { CashflowLineChart } from "@/components/charts/CashflowLineChart";
import type { cashflowTrend, CashflowTrendPoint } from "@/domain/engine";
import { EXPENSE_COLOR, INCOME_COLOR } from "@/lib/cashflow-colors";

/** "12/2024 – 05/2025", collapsing the first year when both ends share it. */
function rangeLabel(points: CashflowTrendPoint[]): string {
  if (points.length === 0) return "";
  const [fy, fm] = points[0].month.split("-");
  const [ly, lm] = points[points.length - 1].month.split("-");
  const left = fy === ly ? fm : `${fm}/${fy}`;
  return `${left} – ${lm}/${ly}`;
}

/**
 * "Biến động thu chi" — the 6-month income/expense trend as two lines, with a
 * toggle between the recent and the previous 6-month window. Data is the engine's
 * `cashflowTrend` over 12 months (invariant #1), split into two windows here.
 */
export function CashflowTrendCard({ trend }: { trend: ReturnType<typeof cashflowTrend> }) {
  const points = trend.points;
  const older = points.slice(0, Math.max(0, points.length - 6));
  const recent = points.slice(Math.max(0, points.length - 6));
  const [window, setWindow] = useState<"older" | "recent">("recent");
  const shown = window === "older" && older.length > 0 ? older : recent;

  return (
    <section aria-label="Biến động thu chi">
      <SectionHeader
        title="Biến động thu chi"
        action={<Freshness at={trend.meta.freshness} className="text-[11px]" />}
      />
      <Card padding="snug" className="flex flex-col gap-4">
        {older.length > 0 && (
          <SegmentedControl
            ariaLabel="Chọn khoảng thời gian"
            value={window}
            onChange={setWindow}
            options={[
              { value: "older", label: rangeLabel(older) },
              { value: "recent", label: rangeLabel(recent) },
            ]}
          />
        )}

        <CashflowLineChart points={shown} />

        <div className="flex items-center justify-center gap-6 text-xs text-muted">
          <LegendItem color={EXPENSE_COLOR} label="Chi tiêu" />
          <LegendItem color={INCOME_COLOR} label="Thu nhập" />
        </div>
      </Card>
    </section>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2.5 w-6 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
