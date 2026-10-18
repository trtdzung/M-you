import { horizonToTargetDate } from "../coach/horizon";
import type { CoachDraft } from "../coach/contracts";
import type { AnalyzeDraft } from "./analysis-types";

/** Coach draft -> advisor draft; null when the horizon does not resolve to a future date. */
export function coachDraftToAnalyze(draft: CoachDraft, now: Date): AnalyzeDraft | null {
  const targetDate = horizonToTargetDate(draft.horizon, now);
  if (!targetDate) return null;
  return {
    name: draft.name,
    targetAmount: draft.target_amount,
    targetDate,
    flexibility: draft.flexibility,
    openingAmount: draft.opening_amount,
  };
}
