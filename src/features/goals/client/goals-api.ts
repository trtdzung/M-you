import type {
  GoalCreateInput,
  GoalLedgerEntry,
  FeasibilityRequest,
  FeasibilityResponse,
  GoalUpdateInput,
  LedgerEntryInput,
  SavingsGoalView,
} from "../model/types";
import type { Analysis, AnalyzeDraft } from "../advisor/analysis-types";
import type { GoalReminder } from "../model/reminder-types";
import type { NarrateInput, NarrateResult } from "../advisor/narration-contract";
import type { CoachAnswer, CoachCurrentDraft, CoachResponse } from "../coach/contracts";
import { fetchJson, jsonInit } from "./http";

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

export const seedDemoGoals = (cif: string) =>
  fetchJson<{ inserted: number }>("/api/goals/demo", jsonInit("POST", { cif }));

export const coachGoal = (
  cif: string,
  input: { request: string; answers: CoachAnswer[]; currentDraft?: CoachCurrentDraft; conversationId?: string },
) =>
  fetchJson<CoachResponse>("/api/goals/coach", jsonInit("POST", { cif, ...input }));

export const analyzeGoal = (
  cif: string,
  input: { draft: AnalyzeDraft; overrides?: { targetDate?: string; targetAmount?: number } },
) => fetchJson<Analysis>("/api/goals/advisor", jsonInit("POST", { cif, ...input }));

export const fetchGoalReminder = (cif: string, goalId: string) =>
  fetchJson<{ reminder: GoalReminder | null }>(`/api/goals/${enc(goalId)}/reminder`, jsonInit("POST", { cif }));

export const dismissGoalReminder = (cif: string, goalId: string, reminderId: string) =>
  fetchJson<{ reminder: null }>(`/api/goals/${enc(goalId)}/reminder`, jsonInit("POST", { cif, dismiss: reminderId }));

export const narrateAdvisor = (cif: string, input: NarrateInput) =>
  fetchJson<NarrateResult>("/api/goals/advisor/narrate", jsonInit("POST", { cif, ...input }));
