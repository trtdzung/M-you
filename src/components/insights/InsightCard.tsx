"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, Info, ThumbsUp, X } from "lucide-react";
import type { Insight, InsightSeverity } from "@/insights/types";
import { Card } from "@/components/primitives";
import { InsightEvidence } from "./InsightEvidence";
import { cn } from "@/lib/cn";

const SEVERITY: Record<InsightSeverity, { icon: typeof Info; color: string }> = {
  urgent: { icon: AlertTriangle, color: "text-negative" },
  attention: { icon: AlertCircle, color: "text-warning" },
  info: { icon: Info, color: "text-primary" },
};

export interface InsightActions {
  dismiss?: (id: string) => void;
  snooze?: (id: string) => void;
  markHelpful?: (id: string) => void;
}

export function InsightCard({
  insight,
  actions,
  defaultOpen = false,
}: {
  insight: Insight;
  actions?: InsightActions;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { icon: Icon, color } = SEVERITY[insight.severity];
  const helpful = insight.status === "helpful";

  return (
    <Card className="p-3">
      <div className="flex items-start gap-2.5">
        <Icon size={18} className={cn("mt-0.5 shrink-0", color)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{insight.title}</p>
          <p className="mt-0.5 text-sm text-muted">{insight.explanation}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              Bằng chứng
              <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
            </button>
            {actions?.markHelpful && (
              <button
                type="button"
                onClick={() => actions.markHelpful?.(insight.id)}
                className={cn("inline-flex items-center gap-1 text-xs", helpful ? "text-positive" : "text-muted")}
              >
                <ThumbsUp size={13} /> {helpful ? "Đã đánh giá" : "Hữu ích"}
              </button>
            )}
            {actions?.snooze && (
              <button type="button" onClick={() => actions.snooze?.(insight.id)} className="text-xs text-muted">
                Tạm ẩn
              </button>
            )}
          </div>

          {open && <InsightEvidence insight={insight} />}
        </div>
        {actions?.dismiss && (
          <button
            type="button"
            onClick={() => actions.dismiss?.(insight.id)}
            aria-label="Bỏ qua"
            className="shrink-0 rounded-full p-1 text-muted hover:bg-surface-muted"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </Card>
  );
}
