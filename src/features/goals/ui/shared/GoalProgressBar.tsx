import { cn } from "@/lib/cn";
import type { GoalProgressState } from "../../model/types";
import { progressFill, progressTrack, STATE_TONE } from "../styles";

export function GoalProgressBar({
  percent,
  state,
}: {
  percent: number;
  state: GoalProgressState;
}) {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={progressTrack}
    >
      <div className={cn(progressFill, STATE_TONE[state].bar)} style={{ width: `${value}%` }} />
    </div>
  );
}
