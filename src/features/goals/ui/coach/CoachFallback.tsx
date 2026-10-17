import { GOALS_COPY } from "../copy";
import { hint, primaryButton, secondaryButton } from "../styles";

/** The coach failed: offer manual entry, showing what the customer said. */
export function CoachFallback({
  request,
  onManual,
  onRetry,
}: {
  request: string;
  onManual: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <p role="alert" className="text-sm text-text">{GOALS_COPY.coach.unavailable}</p>
      {request && <p className={hint}>{GOALS_COPY.coach.yourSentence(request)}</p>}
      <button type="button" onClick={onManual} className={secondaryButton}>
        {GOALS_COPY.coach.manual}
      </button>
      <button type="button" onClick={onRetry} className={primaryButton}>
        {GOALS_COPY.retry}
      </button>
    </div>
  );
}
