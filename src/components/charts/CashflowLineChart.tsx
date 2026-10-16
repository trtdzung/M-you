"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame } from "./ChartFrame";
import type { CashflowTrendPoint } from "@/domain/engine";
import { formatVndUnit } from "@/lib/format";
import { EXPENSE_COLOR, INCOME_COLOR } from "@/lib/cashflow-colors";

/** "T12", "T1/2025" — year shown only on January so the axis stays readable. */
function monthTick(monthKey: string): string {
  const [year, mm] = monthKey.split("-");
  const m = Number(mm);
  return m === 1 ? `T1/${year}` : `T${m}`;
}

/**
 * Biến động thu chi — two smooth income/expense lines with gradient area fills,
 * matching the reference PFM design. No-data months are passed as null so the
 * line breaks rather than dipping to a misleading 0đ (invariant #6). Numbers come
 * straight from the engine's `cashflowTrend` (invariant #1).
 */
export function CashflowLineChart({ points }: { points: CashflowTrendPoint[] }) {
  const data = points.map((p) => ({
    key: p.month,
    label: monthTick(p.month),
    income: p.hasData ? p.income : null,
    expense: p.hasData ? p.expense : null,
  }));

  return (
    <ChartFrame height={240} label="Xu hướng thu và chi theo tháng">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cf-income" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.28} />
              <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="cf-expense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.26} />
              <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted)" />
          <YAxis
            tickFormatter={(v: number) => formatVndUnit(v)}
            width={52}
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-muted)"
          />
          <Tooltip
            formatter={(v: number, name) => [formatVndUnit(v), name === "income" ? "Thu nhập" : "Chi tiêu"]}
            contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid var(--color-border)" }}
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke={INCOME_COLOR}
            strokeWidth={2.5}
            fill="url(#cf-income)"
            dot={{ r: 3, fill: "var(--color-surface)", stroke: INCOME_COLOR, strokeWidth: 2 }}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="expense"
            stroke={EXPENSE_COLOR}
            strokeWidth={2.5}
            fill="url(#cf-expense)"
            dot={{ r: 3, fill: "var(--color-surface)", stroke: EXPENSE_COLOR, strokeWidth: 2 }}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
