"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { ChartFrame } from "./ChartFrame";
import { formatVndCompact } from "@/lib/format";

/** Two-bar income vs expense comparison for the selected month. */
export function IncomeExpenseChart({ income, expense }: { income: number; expense: number }) {
  const data = [
    { name: "Thu nhập", value: income, fill: "var(--color-positive)" },
    { name: "Chi tiêu", value: expense, fill: "var(--color-negative)" },
  ];
  return (
    <ChartFrame height={180} label={`Thu nhập ${formatVndCompact(income)}, chi tiêu ${formatVndCompact(expense)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted)" />
          <Tooltip
            cursor={{ fill: "var(--color-surface-muted)" }}
            formatter={(v: number) => [formatVndCompact(v), ""]}
            labelStyle={{ color: "var(--color-text)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
