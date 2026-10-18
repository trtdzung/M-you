"use client";

import { usePersonaCif } from "@/providers/context";
import type { GoalCreateInput, GoalUpdateInput } from "../../model/types";
import { createGoal, deleteGoal, seedDemoGoals, updateGoal } from "../goals-api";
import { useAction } from "./use-action";

/** Create / update / delete goals for the current persona. Results are null without a cif. */
export function useGoalMutations() {
  const cif = usePersonaCif();
  const { run, pending, errors, reset } = useAction();
  return {
    pending,
    errors,
    reset,
    create: (input: Partial<GoalCreateInput>) => (cif ? run(() => createGoal(cif, input)) : null),
    update: (id: string, patch: GoalUpdateInput) =>
      cif ? run(() => updateGoal(cif, id, patch)) : null,
    remove: (id: string) => (cif ? run(() => deleteGoal(cif, id)) : null),
    seedDemo: () => (cif ? run(() => seedDemoGoals(cif)) : null),
  };
}
