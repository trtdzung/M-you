"use client";

import type { ReactNode } from "react";
import { Sheet } from "@/components/primitives";
import type { GoalCreateInput, GoalUpdateInput } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { errorBox, primaryButton } from "../styles";
import { GoalForm } from "./GoalForm";
import type { GoalFormState } from "./use-goal-form";

/** Sheet shell for creating (no `initial` in the form) or editing a goal. */
export function GoalFormSheet({
  form,
  pending,
  formError,
  slot,
  onSubmit,
  onClose,
}: {
  form: GoalFormState;
  pending: boolean;
  /** Failure not tied to a field ("" = show the default message). */
  formError?: string | null;
  slot?: ReactNode;
  onSubmit: (input: GoalCreateInput | GoalUpdateInput) => void;
  onClose: () => void;
}) {
  const title = form.mode === "create" ? GOALS_COPY.create : GOALS_COPY.edit;
  const submit = () => {
    const input = form.validate();
    if (input) onSubmit(input);
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <GoalForm form={form} slot={slot} />
        {formError !== null && formError !== undefined && (
          <p role="alert" className={`${errorBox} text-sm text-negative`}>
            {formError || GOALS_COPY.actionError}
          </p>
        )}
        <button type="button" onClick={submit} disabled={pending} className={primaryButton}>
          {pending ? GOALS_COPY.saving : GOALS_COPY.save}
        </button>
      </div>
    </Sheet>
  );
}
