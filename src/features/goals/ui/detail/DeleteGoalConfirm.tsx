"use client";

import { Sheet } from "@/components/primitives";
import { GOALS_COPY } from "../copy";
import { dangerButton, errorBox, secondaryButton } from "../styles";

export function DeleteGoalConfirm({
  pending,
  error,
  onConfirm,
  onClose,
}: {
  pending: boolean;
  /** Failure message ("" = show the default). */
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const c = GOALS_COPY.deleteConfirm;
  return (
    <Sheet title={c.title} description={c.description} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error !== null && (
          <p role="alert" className={`${errorBox} text-sm text-negative`}>
            {error || GOALS_COPY.actionError}
          </p>
        )}
        <button type="button" onClick={onConfirm} disabled={pending} className={dangerButton}>
          {c.confirm}
        </button>
        <button type="button" onClick={onClose} className={secondaryButton}>
          {GOALS_COPY.cancel}
        </button>
      </div>
    </Sheet>
  );
}
