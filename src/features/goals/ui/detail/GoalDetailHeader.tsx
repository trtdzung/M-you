import type { SavingsGoalView } from "../../model/types";
import { FlexibilityBadge } from "../shared/FlexibilityBadge";
import { GoalAmountLine } from "../shared/GoalAmountLine";
import { GoalMilestoneLabel } from "../shared/GoalMilestoneLabel";
import { GoalProgressBar } from "../shared/GoalProgressBar";
import { GoalStatusBadge } from "../shared/GoalStatusBadge";

export function GoalDetailHeader({ goal }: { goal: SavingsGoalView }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 truncate text-lg font-bold text-text">{goal.name}</h2>
        <FlexibilityBadge flexibility={goal.flexibility} />
        <GoalStatusBadge status={goal.status} state={goal.progress.state} />
      </div>
      <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
      <div className="flex items-center justify-between gap-2">
        <GoalAmountLine current={goal.currentAmount} target={goal.targetAmount} />
        <GoalMilestoneLabel milestone={goal.progress.milestone} />
      </div>
    </div>
  );
}
