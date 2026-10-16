/**
 * Builds a mini-chart payload from a simulation tool result. The series and
 * summary come straight from the deterministic engine output (grounded by
 * construction) — this only reshapes them for the chat bubble.
 */

import { monthKeyLabel } from "@/lib/demo-clock";
import { formatVndCompact } from "@/lib/format";
import type { WhatIfChartPayload } from "./events";

interface SeriesLike {
  status?: string;
  series?: unknown;
}

function points(series: unknown, key: "projected" | "balance"): { month: string; value: number }[] {
  if (!Array.isArray(series)) return [];
  return series
    .map((p) => {
      const row = p as Record<string, unknown>;
      const month = typeof row.month === "string" ? row.month : "";
      const value = typeof row[key] === "number" ? (row[key] as number) : NaN;
      return { month, value };
    })
    .filter((p) => p.month && Number.isFinite(p.value));
}

export function buildChart(toolName: string, data: Record<string, unknown>): WhatIfChartPayload | null {
  const d = data as SeriesLike & Record<string, unknown>;
  if (d.status === "unknown") return null;

  if (toolName === "simulateGoal") {
    const series = points(d.series, "projected");
    if (series.length < 2) return null;
    const monthsToTarget = d.monthsToTarget as number | null;
    const targetDate = (d.targetDate as string | null) ?? null;
    const summary =
      d.status === "already_met"
        ? "Bạn đã đạt mục tiêu này."
        : targetDate && monthsToTarget
          ? `Đạt mục tiêu sau ~${monthsToTarget} tháng (khoảng ${monthKeyLabel(targetDate)}).`
          : "Với mức đóng góp này, thời gian đạt mục tiêu rất dài.";
    return { kind: "goal", title: `Dự phóng mục tiêu: ${d.goalName}`, series, markerMonth: targetDate, summary };
  }

  if (toolName === "simulateDebtRepayment") {
    const series = points(d.series, "balance");
    if (series.length < 2) return null;
    const payoffDate = (d.payoffDate as string | null) ?? null;
    const months = d.monthsToPayoff as number | null;
    const totalInterest = d.totalInterest as number | null;
    const summary =
      d.status === "payable" && payoffDate && months
        ? `Tất toán sau ~${months} tháng (${monthKeyLabel(payoffDate)}), lãi ước tính ${formatVndCompact(totalInterest)}.`
        : "Khoản trả hàng tháng chưa đủ để tất toán khoản nợ này.";
    return { kind: "debt", title: `Dự phóng trả nợ: ${d.liabilityName}`, series, markerMonth: payoffDate, summary };
  }

  return null;
}
