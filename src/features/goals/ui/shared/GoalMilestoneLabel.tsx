import { GOALS_COPY } from "../copy";

export function GoalMilestoneLabel({ milestone }: { milestone: number }) {
  return <span className="text-xs text-muted">{GOALS_COPY.milestone(milestone)}</span>;
}
