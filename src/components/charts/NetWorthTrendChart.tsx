"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "./ChartFrame";
import type { MonthlySnapshot } from "@/domain/models";
import { formatVndCompact } from "@/lib/format";

/** Net-worth trend from monthly snapshots (oldest → newest). */
export function NetWorthTrendChart({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month.slice(5), netWorth: s.netWorth }));
  return (
    <ChartFrame height={200} label="Xu hướng giá trị ròng theo tháng">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted)" />
          <YAxis tickFormatter={(v: number) => formatVndCompact(v)} width={52} tickLine={false} axisLine={false} fontSize={10} stroke="var(--color-muted)" />
          <Tooltip
            formatter={(v: number) => [formatVndCompact(v), "Giá trị ròng"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
          <Line type="monotone" dataKey="netWorth" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
