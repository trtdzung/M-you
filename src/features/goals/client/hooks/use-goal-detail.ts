"use client";

import type { GoalLedgerEntry, SavingsGoalView } from "../../model/types";
import { getGoal } from "../goals-api";
import { useLoad, type LoadState } from "./use-load";

export interface GoalDetail {
  goal: SavingsGoalView;
  ledger: GoalLedgerEntry[];
}

export function useGoalDetail(id: string): LoadState<GoalDetail> {
  return useLoad(`detail:${id}`, (cif) => getGoal(cif, id));
}
