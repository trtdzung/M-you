import { cn } from "@/lib/cn";
import { PROGRESS_LABEL, STATUS_LABEL } from "../../model/labels";
import type { GoalStatus, ProgressState } from "../../model/types";

const BADGE = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold";

/** One colour per lifecycle status, used everywhere. */
export const STATUS_TONE: Record<GoalStatus, string> = {
  draft: "bg-surface-muted text-muted",
  accumulating: "bg-source-msb-soft text-source-msb",
  paused: "bg-surface-muted text-muted",
  achieved: "bg-source-self-soft text-source-self",
  repaying: "bg-primary-soft text-primary-strong",
  completed: "bg-positive-soft text-positive",
  missed: "bg-warning-soft text-warning",
  closed: "bg-surface-muted text-muted",
};

export const PROGRESS_TONE: Record<ProgressState, { bar: string; text: string; soft: string }> = {
  on_track: { bar: "bg-positive", text: "text-positive", soft: "bg-positive-soft" },
  ahead: { bar: "bg-positive", text: "text-positive", soft: "bg-positive-soft" },
  slightly_behind: { bar: "bg-warning", text: "text-warning", soft: "bg-warning-soft" },
  off_track: { bar: "bg-negative", text: "text-negative", soft: "bg-negative-soft" },
};

export function GoalStatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  return <span className={cn(BADGE, STATUS_TONE[status], className)}>{STATUS_LABEL[status]}</span>;
}

export function ProgressStateBadge({ state, className }: { state: ProgressState; className?: string }) {
  const tone = PROGRESS_TONE[state];
  return <span className={cn(BADGE, tone.soft, tone.text, className)}>{PROGRESS_LABEL[state]}</span>;
}
