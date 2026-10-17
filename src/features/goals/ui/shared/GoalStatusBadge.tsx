import { cn } from "@/lib/cn";
import type { GoalProgressState, GoalStatus } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { STATE_TONE } from "../styles";

const BADGE = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";

/** Progress state of an active goal; paused/archived goals show their status instead. */
export function GoalStatusBadge({
  status,
  state,
}: {
  status: GoalStatus;
  state: GoalProgressState;
}) {
  if (status !== "active") {
    return <span className={cn(BADGE, "bg-surface-muted text-muted")}>{GOALS_COPY.status[status]}</span>;
  }
  const tone = STATE_TONE[state];
  return (
    <span className={cn(BADGE, tone.soft, tone.text)}>{GOALS_COPY.progressState[state]}</span>
  );
}
