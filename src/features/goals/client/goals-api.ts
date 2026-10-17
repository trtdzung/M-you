import type {
  GoalCreateInput,
  GoalFeasibility,
  GoalLedgerEntry,
  GoalUpdateInput,
  Lever,
  LedgerEntryInput,
  SavingsGoalView,
} from "../model/types";
import { fetchJson, jsonInit } from "./http";

export interface FeasibilityRequest {
  targetAmount: number;
  targetDate: string;
  currentAmount?: number;
  flexibility?: "fixed" | "flexible";
  estimatedMonthlySurplus?: number;
}

export interface FeasibilityResponse {
  surplus: number | "unknown";
  feasibility: GoalFeasibility;
  levers: Lever[];
}

const enc = encodeURIComponent;

export const listGoals = (cif: string) =>
  fetchJson<{ goals: SavingsGoalView[] }>(`/api/goals?cif=${enc(cif)}`);

export const getGoal = (cif: string, id: string) =>
  fetchJson<{ goal: SavingsGoalView; ledger: GoalLedgerEntry[] }>(
    `/api/goals/${enc(id)}?cif=${enc(cif)}`,
  );

export const createGoal = (cif: string, input: Partial<GoalCreateInput>) =>
  fetchJson<{ goal: SavingsGoalView }>("/api/goals", jsonInit("POST", { cif, ...input }));

export const updateGoal = (cif: string, id: string, patch: GoalUpdateInput) =>
  fetchJson<{ goal: SavingsGoalView }>(`/api/goals/${enc(id)}`, jsonInit("PUT", { cif, ...patch }));

export const deleteGoal = (cif: string, id: string) =>
  fetchJson<undefined>(`/api/goals/${enc(id)}?cif=${enc(cif)}`, { method: "DELETE" });

export const addLedgerEntry = (cif: string, id: string, entry: Partial<LedgerEntryInput>) =>
  fetchJson<{ entry: GoalLedgerEntry; goal: SavingsGoalView }>(
    `/api/goals/${enc(id)}/ledger`,
    jsonInit("POST", { cif, ...entry }),
  );

export const checkFeasibility = (cif: string, input: FeasibilityRequest) =>
  fetchJson<FeasibilityResponse>("/api/goals/feasibility", jsonInit("POST", { cif, ...input }));
