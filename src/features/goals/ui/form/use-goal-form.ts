"use client";

import { useState } from "react";
import { transferNow } from "@/lib/demo-clock";
import type {
  FieldErrors,
  GoalCreateInput,
  GoalUpdateInput,
  Lever,
  SavingsGoal,
} from "../../model/types";
import { validateGoalCreate, validateGoalUpdate } from "../../model/validate-goal";
import { buildInput, EMPTY_FORM, type GoalFormValues } from "./form-parse";

function fromGoal(goal: SavingsGoal): GoalFormValues {
  return {
    ...EMPTY_FORM,
    name: goal.name,
    targetAmount: String(goal.targetAmount),
    targetDate: goal.targetDate,
    flexibility: goal.flexibility,
    monthlyContribution: goal.monthlyContribution === null ? "" : String(goal.monthlyContribution),
  };
}

/** State + validation of the create/edit goal form (no API calls). */
export function useGoalForm(initial?: SavingsGoal, prefill?: Partial<GoalFormValues>) {
  const mode = initial ? "update" : "create";
  const [values, setValues] = useState<GoalFormValues>(
    initial ? fromGoal(initial) : { ...EMPTY_FORM, ...prefill },
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = <K extends keyof GoalFormValues>(field: K, value: GoalFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => {
      if (!(field in e)) return e;
      const { [field]: _removed, ...rest } = e;
      return rest;
    });
  };

  /** Validates every field; sets `errors` and returns the typed input, or null when invalid. */
  function validate(): GoalCreateInput | GoalUpdateInput | null {
    const { input, errors: parseErrors } = buildInput(values, mode);
    const now = transferNow();
    const result = mode === "create" ? validateGoalCreate(input, now) : validateGoalUpdate(input, now);
    const all = { ...result.errors, ...parseErrors };
    setErrors(all);
    return Object.keys(all).length === 0 && result.ok ? result.value : null;
  }

  /** Writes a lever into the form. `cut_category` changes nothing: returns false (hint only). */
  function applyLever(lever: Lever): boolean {
    if (lever.kind === "extend_date") set("targetDate", lever.newDate);
    else if (lever.kind === "reduce_amount") set("targetAmount", String(lever.newTarget));
    else return false;
    return true;
  }

  return { mode, values, errors, setErrors, set, validate, applyLever };
}

export type GoalFormState = ReturnType<typeof useGoalForm>;
