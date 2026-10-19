"use client";

import { AgentSuggestionCard } from "../../../agent-sim/AgentSuggestionCard";
import { visibleSuggestions } from "../../../agent-sim/rules";
import type { PreviewState } from "../../../model/state";

/** Agent suggestion cards for one goal (whatever `visibleSuggestions` returns). */
export function agentCardsFor(state: PreviewState, goalId: string) {
  const list = visibleSuggestions(state, goalId);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {list.map((s) => (
        <AgentSuggestionCard key={s.id} suggestion={s} />
      ))}
    </div>
  );
}
