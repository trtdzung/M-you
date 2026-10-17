import type { GoalStatus } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { dangerButton, secondaryButton } from "../styles";

/** Buttons only emit callbacks; a button without a handler is disabled. */
export function GoalActionBar({
  status,
  onContribute,
  onWithdraw,
  onEdit,
  onTogglePause,
  onArchive,
  onDelete,
}: {
  status: GoalStatus;
  onContribute?: () => void;
  onWithdraw?: () => void;
  onEdit: () => void;
  onTogglePause: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const a = GOALS_COPY.actions;
  const archived = status === "archived";
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={secondaryButton} onClick={onContribute} disabled={!onContribute || archived}>
        {a.contribute}
      </button>
      <button type="button" className={secondaryButton} onClick={onWithdraw} disabled={!onWithdraw || archived}>
        {a.withdraw}
      </button>
      <button type="button" className={secondaryButton} onClick={onEdit}>
        {a.edit}
      </button>
      {!archived && (
        <button type="button" className={secondaryButton} onClick={onTogglePause}>
          {status === "paused" ? a.resume : a.pause}
        </button>
      )}
      {!archived && (
        <button type="button" className={secondaryButton} onClick={onArchive}>
          {a.archive}
        </button>
      )}
      <button type="button" className={dangerButton} onClick={onDelete}>
        {a.delete}
      </button>
    </div>
  );
}
