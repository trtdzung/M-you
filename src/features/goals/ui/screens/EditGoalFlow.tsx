"use client";

import { useState } from "react";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import type { GoalUpdateInput, SavingsGoalView } from "../../model/types";
import { GoalFormSheet } from "../form/GoalFormSheet";
import { useGoalForm } from "../form/use-goal-form";

/** Edit-goal sheet; unmounting it drops unsaved edits. */
export function EditGoalFlow({
  goal,
  onClose,
  onSaved,
}: {
  goal: SavingsGoalView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useGoalForm(goal);
  const [formError, setFormError] = useState<string | null>(null);
  const { update, pending } = useGoalMutations();

  async function submit(input: unknown) {
    setFormError(null);
    const res = await update(goal.id, input as GoalUpdateInput);
    if (!res) return;
    if (res.ok) {
      onSaved();
      onClose();
      return;
    }
    if (res.errors) form.setErrors(res.errors);
    else setFormError(res.error ?? "");
  }

  return (
    <GoalFormSheet
      form={form}
      pending={pending}
      formError={formError}
      onSubmit={submit}
      onClose={onClose}
    />
  );
}
