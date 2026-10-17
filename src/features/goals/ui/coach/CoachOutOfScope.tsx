import { GOALS_COPY } from "../copy";

export function CoachOutOfScope() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text">{GOALS_COPY.coach.notAGoal}</p>
    </div>
  );
}
