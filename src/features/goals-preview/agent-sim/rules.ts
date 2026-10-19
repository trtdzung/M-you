import type { AgentSuggestion, PreviewState } from "../model/state";

/**
 * Scripted "M-You gợi ý" rules — NO real AI call. Placeholder: T6 fills this in
 * (idle cash, fund drop, maturity, failed standing order, behind plan, early
 * achievement, due soon, missed, overdue, prepay, revalue, priority conflict,
 * insufficient data, loan blocked …).
 *
 * Contract: pure, deterministic, ids stable across renders (e.g.
 * `${kind}:${goalId}`) so `dismissSuggestion` keeps them hidden. Callers filter
 * by `state.dismissedSuggestionIds` via `visibleSuggestions`.
 */
export function getSuggestions(state: PreviewState): AgentSuggestion[] {
  void state;
  return [];
}

/** Suggestions not dismissed, optionally for one goal. */
export function visibleSuggestions(state: PreviewState, goalId?: string): AgentSuggestion[] {
  return getSuggestions(state).filter(
    (s) => !state.dismissedSuggestionIds.includes(s.id) && (goalId === undefined || s.goalId === goalId),
  );
}
