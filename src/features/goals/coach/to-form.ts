import type { GoalFlexibility } from "../model/types";
import type { CoachDraft } from "./contracts";
import { horizonToTargetDate } from "./horizon";

/** Pre-filled values for the goal form (raw strings, same shape as the form state). */
export interface CoachFormValues {
  name: string;
  targetAmount: string;
  targetDate: string;
  flexibility: GoalFlexibility;
  openingAmount: string;
}

/** Agent draft -> form values; `targetDate` is "" when the horizon is not after today. */
export function draftToForm(draft: CoachDraft, now: Date): CoachFormValues {
  return {
    name: draft.name,
    targetAmount: String(draft.target_amount),
    targetDate: horizonToTargetDate(draft.horizon, now) ?? "",
    flexibility: draft.flexibility,
    openingAmount: draft.opening_amount > 0 ? String(draft.opening_amount) : "",
  };
}
