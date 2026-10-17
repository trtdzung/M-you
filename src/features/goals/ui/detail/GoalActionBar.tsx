import type { GoalStatus } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { dangerButton, primaryButton, secondaryButton } from "../styles";

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
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
      <button type="button" className={primaryButton} onClick={onContribute} disabled={!onContribute || archived}>
        {a.contribute}
      </button>
      <button type="button" className={secondaryButton} onClick={onWithdraw} disabled={!onWithdraw || archived}>
        {a.withdraw}
      </button>
      </div>
      <details className="rounded-2xl border border-border bg-surface p-4">
      <summary className="cursor-pointer text-[14px] font-medium text-text">Quản lý mục tiêu</summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
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
      </details>
    </div>
  );
}
