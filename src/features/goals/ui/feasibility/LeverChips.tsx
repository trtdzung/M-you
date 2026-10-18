import type { Lever } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { LeverChip } from "./LeverChip";

export function LeverChips({
  levers,
  onApply,
}: {
  levers: Lever[];
  onApply: (lever: Lever) => void;
}) {
  if (levers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted">{GOALS_COPY.feasibility.levers}</p>
      <div className="flex flex-wrap items-center gap-2">
        {levers.map((l) => (
          <LeverChip key={l.kind} lever={l} onApply={onApply} />
        ))}
      </div>
    </div>
  );
}
