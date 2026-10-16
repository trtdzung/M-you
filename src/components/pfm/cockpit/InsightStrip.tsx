import { AlertCircle, AlertTriangle, ChevronRight, Info } from "lucide-react";
import type { Insight, InsightSeverity } from "@/insights/types";
import { cn } from "@/lib/cn";

const SEVERITY: Record<InsightSeverity, { icon: typeof Info; color: string; ring: string }> = {
  urgent: { icon: AlertTriangle, color: "text-negative", ring: "bg-negative-soft" },
  attention: { icon: AlertCircle, color: "text-warning", ring: "bg-warning-soft" },
  info: { icon: Info, color: "text-primary", ring: "bg-primary-soft" },
};

/**
 * Single-line top insight strip. Truncates the title, colors by severity, and
 * routes to the Gợi ý tab. Rendered only when an insight exists (caller guards).
 */
export function InsightStrip({ insight, onTap }: { insight: Insight; onTap: () => void }) {
  const { icon: Icon, color, ring } = SEVERITY[insight.severity];
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Xem gợi ý: ${insight.title}`}
      className="shadow-card flex w-full items-center gap-3 rounded-[20px] bg-surface p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", ring)}>
        <Icon size={18} className={color} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{insight.title}</p>
        <p className="truncate text-xs text-muted">{insight.explanation}</p>
      </div>
      <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
        Xem gợi ý
        <ChevronRight size={15} />
      </span>
    </button>
  );
}
