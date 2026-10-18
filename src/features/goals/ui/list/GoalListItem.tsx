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
      <Card padding="none" className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-[16px] leading-6 font-semibold text-text">{goal.name}</p>
          <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
        </div>
        <div className="tabular-nums">
          <div className="mb-1 flex items-center justify-between gap-3 text-[12px] text-muted">
            <span>Đã tích lũy / Mục tiêu</span>
            <span className="font-medium">{Math.round(goal.progress.percent)}%</span>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 leading-7">
            <span className="text-[24px] font-semibold tracking-tight text-text">{formatGoalMoney(goal.currentAmount)}</span>
            <span className="text-[14px] text-muted">/ {formatGoalMoney(goal.targetAmount)} VND</span>
          </p>
          <div className="mt-3">
            <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
          </div>
          <div className="mt-2">
            {goal.status !== "active" ? <GoalStatusBadge status={goal.status} state={goal.progress.state} /> : <span className="text-[13px] text-muted">{goal.progress.percent >= 100 ? "Đã đạt mục tiêu" : goal.currentAmount === 0 ? "Chưa có khoản góp" : "Đang tích lũy"}</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/60 pt-3 text-[13px] leading-5">
          <div><p className="mb-1 flex items-center gap-1.5 text-muted"><CalendarDays size={14} aria-hidden="true" />Đến hạn</p><p className="font-medium text-text">{goal.targetDate.split("-").reverse().join("/")}</p></div>
          {goal.status === "active" && goal.currentAmount < goal.targetAmount && <div className="text-right"><p className="mb-1 text-muted">{goal.monthlyContribution !== null ? "Dự định mỗi tháng" : "Cần góp mỗi tháng"}</p><p className="text-[17px] leading-6 font-semibold tabular-nums text-text">{formatGoalMoney(goal.monthlyContribution ?? goal.feasibility.requiredMonthly)} <span className="text-[11px] font-normal text-muted">VND</span></p></div>}
          {goal.status === "active" && goal.currentAmount < goal.targetAmount && <p className="col-span-2 text-right text-[12px] leading-5 text-muted">{goal.monthlyContribution !== null ? "Mức góp do bạn tự đặt" : "Mức góp ước tính, chưa tính lãi"}</p>}
        </div>
      </Card>
    </button>
  );
}
