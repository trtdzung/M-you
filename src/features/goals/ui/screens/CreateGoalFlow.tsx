"use client";

import { useState } from "react";
import { useFeasibility } from "../../client/hooks/use-feasibility";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import type { GoalCreateInput } from "../../model/types";
import { FeasibilityCard } from "../feasibility/FeasibilityCard";
import { feasibilityInputOf } from "../form/feasibility-input";
import { GoalFormSheet } from "../form/GoalFormSheet";
import { useGoalForm } from "../form/use-goal-form";

/** Create-goal sheet with live feasibility; unmounting it resets the form. */
export function CreateGoalFlow({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const form = useGoalForm();
  const [estimate, setEstimate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const feasibility = useFeasibility(feasibilityInputOf(form.values, estimate));
  const { create, pending } = useGoalMutations();

  async function submit(input: unknown) {
    setFormError(null);
    const res = await create(input as GoalCreateInput);
    if (!res) return;
    if (res.ok) {
      onCreated();
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
      slot={
        <FeasibilityCard
          data={feasibility.data}
          loading={feasibility.loading}
          estimate={estimate}
          onEstimateChange={setEstimate}
          onApplyLever={form.applyLever}
        />
      }
    />
  );
}
