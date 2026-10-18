import type { SavingsGoalView } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { GoalListItem } from "./GoalListItem";

/** Active/paused goals first; archived ones sit in a collapsed group at the end. */
export function GoalList({
  goals,
  onOpen,
}: {
  goals: SavingsGoalView[];
  onOpen: (id: string) => void;
}) {
  const live = goals.filter((g) => g.status !== "archived");
  const archived = goals.filter((g) => g.status === "archived");
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {live.map((g) => (
          <li key={g.id}>
            <GoalListItem goal={g} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <details className="group">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-muted">
            {GOALS_COPY.archivedGroup} ({archived.length})
          </summary>
          <ul className="flex flex-col gap-3 pt-2">
            {archived.map((g) => (
              <li key={g.id}>
                <GoalListItem goal={g} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
