"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { formatVndCompact } from "@/lib/format";
import type { WhatIfChartPayload } from "@/ai/pipeline/events";

/** "YYYY-MM" → "MM/YY" for compact axis ticks. */
function shortMonth(key: string): string {
  const [y, m] = key.split("-");
  return `${m}/${y.slice(2)}`;
}

/** Mini projection chart for a what-if simulation, rendered inside a chat bubble. */
export function WhatIfChart({ chart }: { chart: WhatIfChartPayload }) {
  const data = chart.series.map((p) => ({ month: shortMonth(p.month), value: p.value }));
  // MSB cam for the projection line + marker (both goal & debt what-ifs).
  const stroke = "var(--color-primary)";

  return (
    <div className="mt-2 rounded-2xl border border-border bg-surface p-2.5">
      <p className="mb-1 text-xs font-semibold text-text">{chart.title}</p>
      <ChartFrame height={140} label={chart.summary}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} stroke="var(--color-muted)" minTickGap={16} />
            {chart.markerMonth && (
              <ReferenceLine x={shortMonth(chart.markerMonth)} stroke="var(--color-primary)" strokeDasharray="3 3" />
            )}
            <Tooltip
              formatter={(v: number) => [formatVndCompact(v), ""]}
              labelStyle={{ color: "var(--color-text)" }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--color-border)" }}
            />
            <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      <p className="mt-1 text-xs text-muted">{chart.summary}</p>
    </div>
  );
}
