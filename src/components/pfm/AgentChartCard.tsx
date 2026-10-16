"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { formatVndCompact } from "@/lib/format";
import type { ChartUi } from "@/lib/agent-api";

const AXIS_PROPS = { tickLine: false, axisLine: false, fontSize: 11, stroke: "var(--color-muted)", interval: 0 } as const;
// Recharts silently drops X-axis ticks it judges would overlap once there are
// more than a handful — verified against the real agent, a plain axis with 6
// Vietnamese category names only showed 3. `interval={0}` above disables that
// skip logic; angling the labels is what actually keeps them from overlapping
// once every one of them is forced to render.
const CATEGORY_AXIS_PROPS = { ...AXIS_PROPS, angle: -35, textAnchor: "end" as const, height: 52 };
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" } as const;

/**
 * A distinct, high-contrast hue set for arbitrary agent-provided chart
 * categories — deliberately NOT the app's `JAR_COLOR_OPTIONS` (a brand-
 * harmonious, mostly warm/orange family designed for ≤8 *known* jars). An
 * agent chart can have any number of unrelated categories side by side
 * (pie slices, grouped bars) where telling them apart at a glance matters
 * more than brand coherency.
 */
const CHART_PALETTE = [
  "#f26522", // brand orange
  "#0e7490", // teal
  "#eab308", // gold
  "#7c3aed", // violet
  "#16a34a", // green
  "#dc2626", // red
  "#2563eb", // blue
  "#64748b", // slate
] as const;

function paletteColor(i: number): string {
  return CHART_PALETTE[i % CHART_PALETTE.length];
}

/**
 * Renders a `ChartUi` (Feature 2, `ui.type === "chart"`) with Recharts — the
 * dependency this app already uses for every other chart, no need for
 * Chart.js like the reference frontend. Caller must have already validated
 * the payload with `isChartUi` (see `agent-api.ts`); this component trusts
 * its `chart` prop is well-formed.
 */
export function AgentChartCard({ chart }: { chart: ChartUi }) {
  const data = chart.labels.map((label, i) => {
    const row: Record<string, string | number> = { label };
    for (const s of chart.series) row[s.name] = s.data[i];
    return row;
  });

  return (
    <div className="shadow-card mt-2 max-w-[85%] rounded-2xl bg-surface p-3">
      <p className="mb-2 text-xs font-semibold text-text">{chart.title}</p>
      <ChartFrame height={200} label={chart.title}>
        <ResponsiveContainer width="100%" height="100%">
          {chart.chart_type === "pie" ? (
            <PieChart>
              <Pie data={data} dataKey={chart.series[0].name} nameKey="label" innerRadius="50%" outerRadius="85%" paddingAngle={1}>
                {data.map((_, i) => (
                  <Cell key={i} fill={paletteColor(i)} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatVndCompact(v)} contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          ) : chart.chart_type === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" {...AXIS_PROPS} />
              <YAxis tickFormatter={(v: number) => formatVndCompact(v)} width={48} {...AXIS_PROPS} fontSize={10} />
              <Tooltip formatter={(v: number) => formatVndCompact(v)} contentStyle={TOOLTIP_STYLE} />
              {chart.series.map((s, i) => (
                <Line key={s.name} type="monotone" dataKey={s.name} stroke={paletteColor(i)} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" {...CATEGORY_AXIS_PROPS} />
              <YAxis tickFormatter={(v: number) => formatVndCompact(v)} width={48} {...AXIS_PROPS} fontSize={10} />
              <Tooltip formatter={(v: number) => formatVndCompact(v)} contentStyle={TOOLTIP_STYLE} />
              {chart.series.map((s, i) => (
                <Bar key={s.name} dataKey={s.name} fill={paletteColor(i)} radius={[4, 4, 0, 0]} maxBarSize={24} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </ChartFrame>

      {chart.chart_type === "pie" && (
        <ul className="mt-2 flex flex-col gap-1.5" aria-label={`Chú giải ${chart.title}`}>
          {chart.labels.map((label, i) => (
            <li key={label} className="flex items-center gap-2 text-xs text-text">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: paletteColor(i) }} />
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
