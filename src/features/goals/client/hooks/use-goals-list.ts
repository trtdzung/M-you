"use client";

import type { SavingsGoalView } from "../../model/types";
import { listGoals } from "../goals-api";
import { useLoad, type LoadState } from "./use-load";

export function useGoalsList(): LoadState<SavingsGoalView[]> {
  const state = useLoad("list", async (cif) => {
    const res = await listGoals(cif);
    return res.ok ? { ok: true as const, data: res.data.goals } : res;
  });
  return state;
}
