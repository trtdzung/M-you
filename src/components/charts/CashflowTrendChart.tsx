"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "./ChartFrame";
import type { CashflowTrendPoint } from "@/domain/engine";
import { formatVndCompact } from "@/lib/format";

/**
 * Multi-month income vs expense trend. Red Team H3: months with `hasData:false`
 * are passed as null (not 0), so Recharts renders a GAP rather than a misleading
 * 0đ bar.
 */
export function CashflowTrendChart({ points }: { points: CashflowTrendPoint[] }) {
  const data = points.map((p) => ({
    month: p.month.slice(5), // "MM"
    income: p.hasData ? p.income : null,
    expense: p.hasData ? p.expense : null,
  }));

  return (
    <ChartFrame height={220} label="Xu hướng thu và chi theo tháng">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted)" />
          <YAxis tickFormatter={(v: number) => formatVndCompact(v)} width={48} tickLine={false} axisLine={false} fontSize={10} stroke="var(--color-muted)" />
          <Tooltip
            cursor={{ fill: "var(--color-surface-muted)" }}
            formatter={(v: number, name) => [formatVndCompact(v), name === "income" ? "Thu" : "Chi"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
          <Legend formatter={(v) => (v === "income" ? "Thu nhập" : "Chi tiêu")} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="income" fill="var(--color-positive)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expense" fill="var(--color-negative)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
