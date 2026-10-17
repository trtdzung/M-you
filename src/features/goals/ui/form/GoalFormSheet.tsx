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
  inline = false,
}: {
  form: GoalFormState;
  pending: boolean;
  /** Failure not tied to a field ("" = show the default message). */
  formError?: string | null;
  slot?: ReactNode;
  onSubmit: (input: GoalCreateInput | GoalUpdateInput) => void;
  onClose: () => void;
  inline?: boolean;
}) {
  const title = form.mode === "create" ? GOALS_COPY.create : GOALS_COPY.edit;
  const submit = () => {
    const input = form.validate();
    if (input) onSubmit(input);
  };
  const content = (
      <div className="flex flex-col gap-4">
        <GoalForm form={form} slot={slot} compact={inline} />
        {formError !== null && formError !== undefined && (
          <p role="alert" className={`${errorBox} text-sm text-negative`}>
            {formError || GOALS_COPY.actionError}
          </p>
        )}
        <div className={inline ? "sticky bottom-0 z-10 -mx-4 border-t border-border/60 bg-surface/95 px-4 py-3 backdrop-blur" : ""}>
        <button type="button" onClick={submit} disabled={pending} className={`${primaryButton} min-h-12 w-full ${inline ? "h-12 text-[16px]" : ""}`}>
          {pending ? GOALS_COPY.saving : inline ? GOALS_COPY.create : GOALS_COPY.save}
        </button>
        </div>
      </div>
  );
  return inline ? <section className="flex flex-col gap-1">
    <h2 className="text-[18px] leading-6 font-semibold text-text">Bạn muốn tích lũy cho điều gì?</h2>
    <p className="mb-5 mt-1 text-[14px] leading-6 text-muted">Đặt số tiền và thời hạn. Bạn có thể điều chỉnh kế hoạch sau.</p>
    {content}
  </section> : <Sheet title={title} onClose={onClose}>{content}</Sheet>;
}
