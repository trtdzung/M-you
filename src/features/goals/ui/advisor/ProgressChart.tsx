"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analysis, PlanId } from "../../advisor/analysis-types";
import { GOALS_COPY } from "../copy";
import { formatGoalMoney } from "../shared/format-goal-money";

const IDS: PlanId[] = ["keep_deadline", "extend_deadline", "reduce_amount"];
const label = (monthKey: string) => `${monthKey.slice(5)}/${monthKey.slice(0, 4)}`;

/** Savings path of the plans; the selected one is drawn solid, the rest dashed. */
export function ProgressChart({ analysis, selectedPlanId }: { analysis: Analysis; selectedPlanId: PlanId }) {
  const c = GOALS_COPY.advisor;
  const rows = new Map<string, Record<string, number | string>>();
  for (const id of IDS) {
    const plan = analysis.plans[id];
    if (!plan.available) continue;
    for (const p of plan.series) rows.set(p.monthKey, { ...(rows.get(p.monthKey) ?? { monthKey: p.monthKey }), [id]: p.amount });
  }
  const data = [...rows.values()].sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)));
  const selected = analysis.plans[selectedPlanId];
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-[13px] font-semibold text-text">{c.chart.title}</figcaption>
      <div className="h-52 w-full" role="img" aria-label={c.chart.label(c.plans[selectedPlanId])}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis dataKey="monthKey" tickFormatter={label} tick={{ fontSize: 11 }} minTickGap={32} axisLine={false} tickLine={false} />
            <YAxis width={64} tickFormatter={formatGoalMoney} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(k) => label(String(k))} formatter={(v: number) => `${v.toLocaleString("en-US")} VND`} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
            <ReferenceLine y={selected.targetAmount} stroke="var(--color-muted)" strokeDasharray="3 3" />
            {IDS.filter((id) => analysis.plans[id].available && id !== selectedPlanId).map((id) => (
              <Line key={id} name={c.plans[id]} dataKey={id} stroke="var(--color-muted)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls isAnimationActive={false} />
            ))}
            <Line name={c.plans[selectedPlanId]} dataKey={selectedPlanId} stroke="var(--color-primary)" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
