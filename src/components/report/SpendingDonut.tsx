"use client";

import { useMemo, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Money } from "@/components/primitives";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { categoryColor, CATEGORY_COLOR_FALLBACK } from "@/lib/category-colors";
import { formatVndCompact, formatVndUnit } from "@/lib/format";
import { KHAC_JAR_ID, KHAC_JAR_LABEL } from "@/domain/engine";

/** One jar's slice. `colorKey` is a category id used for a stable hue. */
export interface JarDonutDatum {
  id: string;
  label: string;
  amount: number;
  colorKey: string;
}

/** A resolved slice with its share + color, ready to draw. */
interface Slice extends JarDonutDatum {
  share: number;
  color: string;
}

const MAX_SLICES = 6;

/** Donut nhóm theo hũ (không phải danh mục lẻ). >6 hũ → gộp phần dư vào "Khác",
 * nên tổng slice luôn = tổng chi (Σ-conservation, H4). Slice lớn nhất trước. */
function toSlices(data: JarDonutDatum[]): { slices: Slice[]; total: number } {
  const positive = data.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = positive.reduce((s, d) => s + d.amount, 0);

  let kept = positive;
  if (positive.length > MAX_SLICES) {
    const head = positive.slice(0, MAX_SLICES - 1);
    const rest = positive.slice(MAX_SLICES - 1).reduce((s, d) => s + d.amount, 0);
    kept = [...head, { id: KHAC_JAR_ID, label: KHAC_JAR_LABEL, amount: rest, colorKey: KHAC_JAR_ID }];
  }

  const slices = kept.map((d) => ({
    ...d,
    share: total > 0 ? d.amount / total : 0,
    color: d.id === KHAC_JAR_ID ? CATEGORY_COLOR_FALLBACK : categoryColor(d.colorKey),
  }));
  return { slices, total };
}

/**
 * Chi tiêu theo hũ dạng donut, dùng chung cho Tổng quan (mini) và Báo cáo (full).
 * Presentation-only: nhận danh sách hũ + số đã tiêu, tự gộp ≤6 slice và tô màu ổn
 * định theo danh mục đại diện. Tâm donut hiện tổng chi; `legend` bật danh sách %.
 */
/** On-slice percentage label; drawn only for slices large enough to fit text. */
function sliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number;
}) {
  if (percent < 0.08) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="var(--color-primary-fg)" fontSize={12} fontWeight={600} textAnchor="middle" dominantBaseline="central">
      {Math.round(percent * 100)}%
    </text>
  );
}

export function SpendingDonut({
  data,
  height = 200,
  legend = false,
  centerLabel = "Tổng chi",
  centerBadge,
  emptyLabel = "Chưa có chi tiêu kỳ này.",
  showPercentLabels = false,
}: {
  data: JarDonutDatum[];
  height?: number;
  legend?: boolean;
  centerLabel?: string;
  centerBadge?: ReactNode;
  emptyLabel?: string;
  showPercentLabels?: boolean;
}) {
  const { slices, total } = useMemo(() => toSlices(data), [data]);

  if (slices.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <ChartFrame height={height} label="Tỉ trọng chi tiêu theo hũ">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="amount"
                nameKey="label"
                innerRadius="62%"
                outerRadius="92%"
                startAngle={90}
                endAngle={-270}
                paddingAngle={1}
                stroke="var(--color-surface)"
                label={showPercentLabels ? sliceLabel : undefined}
                labelLine={false}
              >
                {slices.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, name) => [formatVndCompact(v), name as string]}
                contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid var(--color-border)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartFrame>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-[11px] text-muted">{centerLabel}</span>
          <span className="text-lg font-bold text-text">{formatVndUnit(total)}</span>
          {centerBadge}
        </div>
      </div>

      {legend && (
        <ul className="flex flex-col gap-2">
          {slices.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 truncate text-text">{s.label}</span>
              <span className="text-xs text-muted">{Math.round(s.share * 100)}%</span>
              <Money amount={s.amount} className="w-24 text-right font-medium text-text" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
