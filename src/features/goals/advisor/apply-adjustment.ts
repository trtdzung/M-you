import type { CoachAdjustment } from "../coach/contracts";
import { addMonthsToDate, monthsLeft } from "../engine/months";
import { todayVn } from "../model/today";
import type { AnalyzeDraft } from "./analysis-types";

const MAX_MONTHS = 600;

/** Apply one normalised adjustment from the agent to the draft being analysed. Pure. */
export function applyAdjustment(draft: AnalyzeDraft, adj: CoachAdjustment, now: Date): AnalyzeDraft {
  switch (adj.kind) {
    case "extend_months":
      return { ...draft, targetDate: addMonthsToDate(draft.targetDate, adj.value) };
    case "reduce_amount_to":
      return { ...draft, targetAmount: adj.value };
    case "use_savings_amount":
      return { ...draft, openingAmount: draft.openingAmount + adj.value };
    case "raise_saving_to": {
      // Saving `value` a month: the deadline becomes however long that takes.
      const months = Math.min(MAX_MONTHS, Math.max(1, Math.ceil((draft.targetAmount - draft.openingAmount) / adj.value)));
      return { ...draft, targetDate: addMonthsToDate(todayVn(now), months) };
    }
  }
}

export function applyAdjustments(draft: AnalyzeDraft, list: CoachAdjustment[], now: Date): AnalyzeDraft {
  return list.reduce((d, a) => applyAdjustment(d, a, now), draft);
}

/** What the agent needs to judge an edit of this draft. */
export function toCurrentDraft(draft: AnalyzeDraft, now: Date) {
  return { target_amount: draft.targetAmount, opening_amount: draft.openingAmount, months: monthsLeft(now, draft.targetDate) };
}
