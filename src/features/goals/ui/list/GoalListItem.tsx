import { Card } from "@/components/primitives";
import { formatVndCompact } from "@/lib/format";
import type { SavingsGoalView } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { FlexibilityBadge } from "../shared/FlexibilityBadge";
import { GoalAmountLine } from "../shared/GoalAmountLine";
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
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-base font-semibold text-text">{goal.name}</p>
          <div className="flex shrink-0 items-center gap-1">
            <FlexibilityBadge flexibility={goal.flexibility} />
            <GoalStatusBadge status={goal.status} state={goal.progress.state} />
          </div>
        </div>
        <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
        <div className="flex items-center justify-between gap-2">
          <GoalAmountLine current={goal.currentAmount} target={goal.targetAmount} />
          {goal.monthlyContribution !== null && (
            <p className="text-xs tabular-nums text-muted">
              {GOALS_COPY.listMonthly(formatVndCompact(goal.monthlyContribution))}
            </p>
          )}
        </div>
      </Card>
    </button>
  );
}
