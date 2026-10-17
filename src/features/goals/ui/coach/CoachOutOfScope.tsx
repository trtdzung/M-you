import { GOALS_COPY } from "../copy";
import { secondaryButton } from "../styles";

export function CoachOutOfScope({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text">{GOALS_COPY.coach.notAGoal}</p>
      <button type="button" onClick={onRestart} className={secondaryButton}>
        {GOALS_COPY.coach.restart}
      </button>
    </div>
  );
}
