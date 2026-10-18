"use client";

import { useState } from "react";
import { useFeasibility } from "../../client/hooks/use-feasibility";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import type { GoalCreateInput } from "../../model/types";
import { FeasibilityCard } from "../feasibility/FeasibilityCard";
import { feasibilityInputOf } from "../form/feasibility-input";
import { GoalFormSheet } from "../form/GoalFormSheet";
import { useGoalForm } from "../form/use-goal-form";
import type { GoalFormValues } from "../form/form-parse";
import { GOALS_COPY } from "../copy";
import { hint } from "../styles";

/** Create-goal sheet with live feasibility; unmounting it resets the form. */
export function CreateGoalFlow({
  onClose,
  onCreated,
  prefill,
  requestKey,
  suggestion,
  inline = false,
  open = true,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Values the Goal Coach filled in. */
  prefill?: Partial<GoalFormValues>;
  /** Idempotency key sent with the create call. */
  requestKey?: string;
  /** The customer's own sentence, shown as a hint above the form. */
  suggestion?: string;
  inline?: boolean;
  open?: boolean;
}) {
  const form = useGoalForm(undefined, prefill);
  const [estimate, setEstimate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const feasibility = useFeasibility(feasibilityInputOf(form.values, estimate));
  const { create, pending } = useGoalMutations();

  async function submit(input: unknown) {
    setFormError(null);
    const res = await create({ ...(input as GoalCreateInput), ...(requestKey ? { requestKey } : {}) });
    if (!res) return;
    if (res.ok) {
      onCreated(res.data.goal.id);
      onClose();
      return;
    }
    if (res.errors) form.setErrors(res.errors);
    else setFormError(res.error ?? "");
  }

  return (
    <GoalFormSheet
      open={open}
      inline={inline}
      form={form}
      pending={pending}
      formError={formError}
      onSubmit={submit}
      onClose={onClose}
      slot={
        <>
          {suggestion && <p className={hint}>{GOALS_COPY.coach.yourSentence(suggestion)}</p>}
          {!inline && <FeasibilityCard
            data={feasibility.data}
            loading={feasibility.loading}
            estimate={estimate}
            onEstimateChange={setEstimate}
            onApplyLever={form.applyLever}
          />}
        </>
      }
    />
  );
}
