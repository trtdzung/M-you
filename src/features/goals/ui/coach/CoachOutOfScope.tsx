import type { CoachReply } from "../../coach/contracts";
import { GOALS_COPY } from "../copy";
import { chip } from "../styles";

/** The coach's answer to a message that is not a goal yet, with goal ideas to start from in one tap. */
export function CoachOutOfScope({ reply, disabled, onPick }: { reply: CoachReply | null; disabled?: boolean; onPick: (goal: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-surface-tint px-4 py-3 text-[16px] leading-6 text-text">
        {reply?.text ?? GOALS_COPY.coach.notAGoal}
      </p>
      {reply && reply.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Mục tiêu gợi ý">
          {reply.suggestions.map((goal) => (
            <button
              key={goal}
              type="button"
              disabled={disabled}
              onClick={() => onPick(goal)}
              className={chip}
            >
              {goal}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
