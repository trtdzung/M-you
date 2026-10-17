import { Card } from "@/components/primitives";
import { ChevronRight, CalendarDays } from "lucide-react";
import { formatVndCompact } from "@/lib/format";
import type { SavingsGoalView } from "../../model/types";
import { GoalProgressBar } from "../shared/GoalProgressBar";
import { GoalStatusBadge } from "../shared/GoalStatusBadge";

export function GoalListItem({
  goal,
  onOpen,
}: {
  goal: SavingsGoalView;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(goal.id)}
      className="block w-full rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <Card padding="none" className="flex flex-col gap-3 rounded-2xl border border-border/60 p-4 shadow-none">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-[18px] leading-6 font-semibold text-text">{goal.name}</p>
          <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
          <span className="text-[26px] leading-8 font-semibold tracking-tight text-text">{formatVndCompact(goal.currentAmount).replace(/\s*₫$/, "")}</span>
          <span className="text-[14px] text-muted">/ {formatVndCompact(goal.targetAmount).replace(/\s*₫$/, "")} VND</span>
        </div>
        <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GoalStatusBadge status={goal.status} state={goal.progress.state} />
          <span className="text-[13px] font-medium tabular-nums text-muted">{Math.round(goal.progress.percent)}%</span>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3 text-[14px] leading-5 text-muted">
          <p className="flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" />{goal.targetDate.split("-").reverse().join("/")}</p>
          {goal.status === "active" && (
            <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 tabular-nums">
              <span>{goal.monthlyContribution !== null ? "Góp mỗi tháng" : "Cần góp mỗi tháng"}</span><span className="font-medium text-text">{formatVndCompact(goal.monthlyContribution ?? goal.feasibility.requiredMonthly)}</span>
            </p>
          )}
        </div>
      </Card>
    </button>
  );
}
