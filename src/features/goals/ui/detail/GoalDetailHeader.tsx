import type { SavingsGoalView } from "../../model/types";
import { FlexibilityBadge } from "../shared/FlexibilityBadge";
import { GoalMilestoneLabel } from "../shared/GoalMilestoneLabel";
import { GoalProgressBar } from "../shared/GoalProgressBar";
import { GoalStatusBadge } from "../shared/GoalStatusBadge";
import { formatVndCompact } from "@/lib/format";

export function GoalDetailHeader({ goal }: { goal: SavingsGoalView }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="w-full break-words text-[22px] leading-7 font-semibold text-text">{goal.name}</h2>
        <FlexibilityBadge flexibility={goal.flexibility} />
        <GoalStatusBadge status={goal.status} state={goal.progress.state} />
      </div>
      <div className="pt-2"><p className="text-[13px] text-muted">Đã tích lũy</p><p className="mt-1 text-[32px] leading-10 font-semibold tracking-tight tabular-nums text-text">{formatVndCompact(goal.currentAmount).replace(/\s*₫$/, "")} <span className="text-[14px] font-normal text-muted">VND</span></p><p className="mt-1 text-[14px] text-muted">Mục tiêu {formatVndCompact(goal.targetAmount).replace(/\s*₫$/, "")} VND</p></div>
      <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] text-muted">{goal.progress.percent}% hoàn thành</p>
        <GoalMilestoneLabel milestone={goal.progress.milestone} />
      </div>
      <p className="rounded-xl bg-surface-muted p-3 text-[14px] text-text">{goal.currentAmount >= goal.targetAmount ? "Bạn đã đạt số tiền mục tiêu!" : `Còn cần ${formatVndCompact(goal.targetAmount - goal.currentAmount).replace(/\s*₫$/, "")} VND`}</p>
    </div>
  );
}
