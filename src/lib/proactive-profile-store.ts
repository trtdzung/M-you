import "server-only";

import { randomUUID } from "node:crypto";
import type { Goal, Liability } from "@/domain/models";
import { isValidLiabilityRecord } from "@/domain/models/asset-liability-input";
import { isValidGoalRecord } from "@/domain/models/goal-input";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { getDb } from "./db";

interface ProfileRow { liabilities_json: string; goals_json: string; sync_token: string; verified_at: string }
export interface FinancialProfile { liabilities: Liability[]; goals: Goal[]; verifiedAt: string }

/** Only self-reported records are accepted from the browser; fixture facts are added server-side. */
export function syncFinancialProfile(cif: string, rawLiabilities: unknown, rawGoals: unknown): string | null {
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona || !Array.isArray(rawLiabilities) || !Array.isArray(rawGoals) ||
      rawLiabilities.length > 50 || rawGoals.length > 50 ||
      !rawLiabilities.every((l) => isValidLiabilityRecord(l) && l.source === "self_reported") ||
      !rawGoals.every((g) => isValidGoalRecord(g) && g.source === "self_reported")) return null;
  const liabilityIds = new Set(persona.liabilities.map((l) => l.id));
  const goalIds = new Set(persona.goals.map((g) => g.id));
  const userLiabilities = rawLiabilities as Liability[];
  const userGoals = rawGoals as Goal[];
  for (const liability of userLiabilities) {
    if (liabilityIds.has(liability.id)) return null;
    liabilityIds.add(liability.id);
  }
  for (const goal of userGoals) {
    if (goalIds.has(goal.id)) return null;
    goalIds.add(goal.id);
  }
  const token = randomUUID();
  const liabilities = [...persona.liabilities, ...userLiabilities];
  const goals = [...persona.goals, ...userGoals];
  getDb().prepare(`INSERT INTO proactive_financial_profiles
    (cif, liabilities_json, goals_json, sync_token, verified_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cif) DO UPDATE SET liabilities_json = excluded.liabilities_json,
      goals_json = excluded.goals_json, sync_token = excluded.sync_token,
      verified_at = excluded.verified_at`).run(
    cif, JSON.stringify(liabilities), JSON.stringify(goals), token, new Date().toISOString(),
  );
  return token;
}

/** A current Home sync token is required so stale browser profile data cannot enable P4. */
export function readFinancialProfile(cif: string, token: string | null): FinancialProfile | null {
  if (!token) return null;
  const row = getDb().prepare("SELECT * FROM proactive_financial_profiles WHERE cif = ? AND sync_token = ?")
    .get(cif, token) as ProfileRow | undefined;
  if (!row || Date.now() - Date.parse(row.verified_at) > 5 * 60_000) return null;
  try {
    const liabilities: unknown = JSON.parse(row.liabilities_json);
    const goals: unknown = JSON.parse(row.goals_json);
    if (!Array.isArray(liabilities) || !Array.isArray(goals) ||
        !liabilities.every(isValidLiabilityRecord) || !goals.every((g) => {
          // Seed Goal lacks monthlyContribution; user GoalRecord has it.
          const value = g as Record<string, unknown>;
          return typeof value?.id === "string" && typeof value?.name === "string" &&
            typeof value?.targetAmount === "number" && Number.isSafeInteger(value.targetAmount) && value.targetAmount >= 0 &&
            typeof value?.currentAmount === "number" && Number.isSafeInteger(value.currentAmount) && value.currentAmount >= 0 &&
            (value?.targetDate === null || typeof value?.targetDate === "string");
        })) return null;
    return { liabilities, goals: goals as Goal[], verifiedAt: row.verified_at };
  } catch { return null; }
}
