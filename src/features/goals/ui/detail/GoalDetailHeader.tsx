import type { SavingsGoalView } from "../../model/types";
import { FlexibilityBadge } from "../shared/FlexibilityBadge";
import { GoalMilestoneLabel } from "../shared/GoalMilestoneLabel";
import { GoalProgressBar } from "../shared/GoalProgressBar";
import { GoalStatusBadge } from "../shared/GoalStatusBadge";
import { formatGoalMoney } from "../shared/format-goal-money";

export function GoalDetailHeader({ goal }: { goal: SavingsGoalView }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="w-full break-words text-[22px] leading-7 font-semibold text-text">{goal.name}</h2>
        <FlexibilityBadge flexibility={goal.flexibility} />
        {goal.status === "active" && goal.currentAmount === 0 ? <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] text-muted">Chưa có khoản góp</span> : <GoalStatusBadge status={goal.status} state={goal.progress.state} />}
      </div>
      <div className="pt-2"><p className="text-[13px] text-muted">Đã tích lũy</p><p className="mt-1 text-[32px] leading-10 font-semibold tracking-tight tabular-nums text-text">{formatGoalMoney(goal.currentAmount)} <span className="text-[14px] font-normal text-muted">VND</span></p><p className="mt-1 text-[14px] text-muted">Mục tiêu {formatGoalMoney(goal.targetAmount)} VND</p></div>
      <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] text-muted">{goal.progress.percent}% hoàn thành</p>
        <GoalMilestoneLabel milestone={goal.progress.milestone} />
      </div>
      <p className="rounded-xl bg-surface-muted p-3 text-[14px] text-text">{goal.currentAmount >= goal.targetAmount ? "Bạn đã đạt số tiền mục tiêu!" : `Còn cần ${formatGoalMoney(goal.targetAmount - goal.currentAmount)} VND`}</p>
    </div>
  );
}
