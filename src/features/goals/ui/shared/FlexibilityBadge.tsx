import type { GoalFlexibility } from "../../model/types";
import { GOALS_COPY } from "../copy";

export function FlexibilityBadge({ flexibility }: { flexibility: GoalFlexibility }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-soft">
      {GOALS_COPY.flexibility[flexibility]}
    </span>
  );
}
