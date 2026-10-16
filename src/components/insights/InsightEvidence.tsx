import type { Insight } from "@/insights/types";
import { formatVnd } from "@/lib/format";

/** Expandable evidence: the source facts + comparison period behind an insight. */
export function InsightEvidence({ insight }: { insight: Insight }) {
  return (
    <div className="mt-2 rounded-lg bg-surface-muted p-3 text-xs">
      <p className="mb-1.5 font-medium text-muted">Cơ sở số liệu</p>
      <ul className="flex flex-col gap-1">
        {insight.sourceFacts.map((f, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="text-muted">{f.label}</span>
            <span className="font-medium text-text">
              {typeof f.value === "number" ? formatVnd(f.value) : f.value}
            </span>
          </li>
        ))}
      </ul>
      {insight.comparisonPeriod && (
        <p className="mt-2 text-muted">So sánh với: {insight.comparisonPeriod}</p>
      )}
      <p className="mt-1 text-muted">Độ tin cậy: {Math.round(insight.confidence * 100)}%</p>
    </div>
  );
}
