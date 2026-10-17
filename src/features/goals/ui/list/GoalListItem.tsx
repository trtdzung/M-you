import { Card } from "@/components/primitives";
import { ChevronRight, CalendarDays } from "lucide-react";
import { formatGoalMoney } from "../shared/format-goal-money";
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
        <div className="tabular-nums">
          <p className="mb-1 text-[12px] text-muted">Đã tích lũy</p>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-[32px] leading-10 font-semibold tracking-tight text-text">{formatGoalMoney(goal.currentAmount)}</span><span className="text-[13px] text-muted">VND</span></p>
          <p className="mt-1 text-[14px] leading-5 text-muted">Mục tiêu {formatGoalMoney(goal.targetAmount)} VND</p>
        </div>
        <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {goal.status !== "active" ? <GoalStatusBadge status={goal.status} state={goal.progress.state} /> : <span className="text-[13px] text-muted">{goal.progress.percent >= 100 ? "Đã đạt mục tiêu" : goal.currentAmount === 0 ? "Chưa có khoản góp" : "Đang tích lũy"}</span>}
          <span className="text-[13px] font-medium tabular-nums text-muted">{Math.round(goal.progress.percent)}%</span>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-[13px] leading-5">
          <div><p className="mb-1 flex items-center gap-1.5 text-muted"><CalendarDays size={14} aria-hidden="true" />Đến hạn</p><p className="font-medium text-text">{goal.targetDate.split("-").reverse().join("/")}</p></div>
          {goal.status === "active" && goal.currentAmount < goal.targetAmount && <div className="text-right"><p className="mb-1 text-muted">{goal.monthlyContribution !== null ? "Dự định mỗi tháng" : "Cần góp mỗi tháng"}</p><p className="text-[17px] leading-6 font-semibold tabular-nums text-text">{formatGoalMoney(goal.monthlyContribution ?? goal.feasibility.requiredMonthly)} <span className="text-[11px] font-normal text-muted">VND</span></p></div>}
          {goal.status === "active" && goal.currentAmount < goal.targetAmount && <p className="col-span-2 -mt-2 text-right text-[12px] leading-5 text-muted">{goal.monthlyContribution !== null ? "Mức góp do bạn tự đặt" : "Mức góp ước tính, chưa tính lãi"}</p>}
        </div>
      </Card>
    </button>
  );
}
