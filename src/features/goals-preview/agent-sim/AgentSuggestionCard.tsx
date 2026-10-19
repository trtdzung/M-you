"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AgentSuggestion, SuggestionAction } from "../model/state";
import { usePreview } from "../store/PreviewStore";
import { ring } from "../ui/shared/styles";

const TONE: Record<NonNullable<AgentSuggestion["tone"]>, string> = {
  info: "border-source-msb/20",
  warning: "border-warning/40",
  success: "border-positive/30",
};

/**
 * Simulated agent card: header "M-You gợi ý" + "Mô phỏng" tag, title, body,
 * 1–2 actions (navigate and/or dispatch) and dismiss.
 */
export function AgentSuggestionCard({ suggestion, className }: { suggestion: AgentSuggestion; className?: string }) {
  const { dispatch, nav } = usePreview();
  const [open, setOpen] = useState(false);

  function run(action: SuggestionAction) {
    setOpen(false);
    if (action.action) dispatch(action.action);
    if (action.nav) nav.push(action.nav.screen, action.nav.params);
  }

  const actions = suggestion.actions.slice(0, 2);
  return (
    <section
      aria-label={`M-You gợi ý: ${suggestion.title}`}
      className={cn("rounded-card border bg-surface p-4 shadow-card", TONE[suggestion.tone ?? "info"], className)}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
          <Sparkles size={15} aria-hidden />
        </span>
        <span className="text-[13px] font-semibold text-text">M-You gợi ý</span>
        <span className="rounded-full bg-source-mock-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-source-mock">
          Mô phỏng
        </span>
        <button
          type="button"
          aria-label="Ẩn gợi ý"
          onClick={() => dispatch({ type: "dismissSuggestion", id: suggestion.id })}
          className={`-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-text ${ring}`}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={`mt-1 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left ${ring}`}>
        <span className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold leading-6 text-text">{suggestion.title}</span>
          <span className="text-[13px] font-semibold text-primary-strong">Xem chi tiết</span>
        </span>
        <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
      </button>
      <Sheet open={open} title={suggestion.title} onClose={() => setOpen(false)}>
      <p className="mb-3 text-[12px] text-source-mock">M-You gợi ý · Dữ liệu mô phỏng</p>
      <p className="mt-1 text-sm leading-5 text-muted">{suggestion.body}</p>
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action, i) => {
            const primary = action.primary ?? i === 0;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => run(action)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold",
                  ring,
                  primary ? "bg-primary text-primary-fg" : "border border-border text-text hover:bg-surface-muted",
                )}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
      </Sheet>
    </section>
  );
}
