"use client";

import type { MouseEvent } from "react";
import { AgentSuggestionCard } from "../../../agent-sim/AgentSuggestionCard";
import type { AgentSuggestion, PreviewState } from "../../../model/state";
import { usePreview } from "../../../store/PreviewStore";

/**
 * One server suggestion card. A click on one of its action buttons is logged as
 * "acted" (store action) or "clicked" (navigation); "Để sau" / "Ẩn gợi ý" are
 * logged as "dismissed" by the store's `dismissSuggestion`.
 */
function ServerSuggestionCard({ suggestion }: { suggestion: AgentSuggestion }) {
  const { recordSuggestionEvent } = usePreview();
  // The card's sheet renders in a portal; React still bubbles its clicks to this wrapper.
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button");
    const label = button?.textContent?.trim();
    const action = suggestion.actions.slice(0, 2).find((a) => a.label === label);
    if (!action || action.action?.type === "dismissSuggestion") return;
    recordSuggestionEvent(suggestion.id, action.action ? "acted" : "clicked");
  }
  return (
    <div onClickCapture={onClickCapture}>
      <AgentSuggestionCard suggestion={suggestion} />
    </div>
  );
}

/** Server suggestions not hidden locally, optionally only one goal's, at most `limit`. */
export function useServerSuggestions(goalId?: string, limit?: number): AgentSuggestion[] {
  const { state, suggestions } = usePreview();
  const hidden = new Set(state.dismissedSuggestionIds);
  const list = (suggestions ?? []).filter((s) => !hidden.has(s.id) && (goalId === undefined || s.goalId === goalId));
  return limit === undefined ? list : list.slice(0, limit);
}

export function ServerSuggestionList({ goalId, limit, ariaLabel }: { goalId?: string; limit?: number; ariaLabel?: string }) {
  const list = useServerSuggestions(goalId, limit);
  if (list.length === 0) return null;
  const cards = list.map((s) => <ServerSuggestionCard key={s.id} suggestion={s} />);
  return ariaLabel ? (
    <section className="flex flex-col gap-3" aria-label={ariaLabel}>
      {cards}
    </section>
  ) : (
    <div className="flex flex-col gap-3">{cards}</div>
  );
}

/** Agent suggestion cards for one goal (from the server; renders nothing until loaded or when empty). */
export function agentCardsFor(_state: PreviewState, goalId: string) {
  return <ServerSuggestionList goalId={goalId} />;
}
