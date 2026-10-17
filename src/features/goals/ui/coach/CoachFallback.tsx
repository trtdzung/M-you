import { GOALS_COPY } from "../copy";
import { hint, primaryButton, secondaryButton } from "../styles";

/** The coach failed: offer manual entry, showing what the customer said. */
export function CoachFallback({
  request,
  onManual,
  onRestart,
}: {
  request: string;
  onManual: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-sm text-text">{GOALS_COPY.coach.unavailable}</p>
      {request && <p className={hint}>{GOALS_COPY.coach.yourSentence(request)}</p>}
      <button type="button" onClick={onManual} className={primaryButton}>
        {GOALS_COPY.coach.manual}
      </button>
      <button type="button" onClick={onRestart} className={secondaryButton}>
        {GOALS_COPY.coach.restart}
      </button>
    </div>
  );
}
