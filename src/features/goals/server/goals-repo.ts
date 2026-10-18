import "server-only";

import { randomUUID } from "node:crypto";
import type {
  GoalCreateInput,
  GoalStatus,
  GoalUpdateInput,
  SavingsGoal,
} from "../model/types";
import { addMonthsToDate } from "../engine/months";
import { todayVn } from "../model/today";
import { goalsDb } from "./db";

interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  target_date: string;
  flexibility: SavingsGoal["flexibility"];
  monthly_contribution: number | null;
  status: GoalStatus;
  paused_until: string | null;
  jar_id: string | null;
  created_at: string;
  updated_at: string;
  request_key: string | null;
}

function toGoal(r: GoalRow): SavingsGoal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: r.target_amount,
    targetDate: r.target_date,
    flexibility: r.flexibility,
    monthlyContribution: r.monthly_contribution,
    status: r.status,
    pausedUntil: r.paused_until,
    jarId: r.jar_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    source: "self_reported",
  };
}

/** Oldest first; archived goals are included (the UI groups them). */
export function listGoals(cif: string): SavingsGoal[] {
  const rows = goalsDb()
    .prepare("SELECT * FROM user_goals WHERE cif = ? ORDER BY created_at ASC, id ASC")
    .all(cif) as GoalRow[];
  return rows.map(toGoal);
}

/** The goal this cif already created with `requestKey`, if any. */
export function findGoalByRequestKey(cif: string, requestKey: string): SavingsGoal | null {
  const row = goalsDb()
    .prepare("SELECT * FROM user_goals WHERE cif = ? AND request_key = ?")
    .get(cif, requestKey) as GoalRow | undefined;
  return row ? toGoal(row) : null;
}

export function getGoal(cif: string, id: string): SavingsGoal | null {
  const row = goalsDb()
    .prepare("SELECT * FROM user_goals WHERE cif = ? AND id = ?")
    .get(cif, id) as GoalRow | undefined;
  return row ? toGoal(row) : null;
}

/** Inserts the goal row only; `openingAmount` is handled by `createGoalWithOpening`. */
export function insertGoal(cif: string, input: GoalCreateInput, now: Date): SavingsGoal {
  const id = `goal_${randomUUID()}`;
  const ts = now.toISOString();
  goalsDb()
    .prepare(
      `INSERT INTO user_goals (cif, id, name, target_amount, target_date, flexibility,
         monthly_contribution, status, created_at, updated_at, request_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
    .run(cif, id, input.name, input.targetAmount, input.targetDate, input.flexibility,
      input.monthlyContribution, ts, ts, input.requestKey ?? null);
  return getGoal(cif, id)!;
}

const COLUMNS: Record<Exclude<keyof GoalUpdateInput, "pauseMonths">, string> = {
  name: "name",
  targetAmount: "target_amount",
  targetDate: "target_date",
  flexibility: "flexibility",
  monthlyContribution: "monthly_contribution",
  status: "status",
};

/**
 * Applies only the fields present in `patch`; null when the goal does not exist. Any status change
 * resets the timed pause: `paused` with `pauseMonths` sets the resume date, everything else clears it.
 */
export function updateGoal(
  cif: string,
  id: string,
  patch: GoalUpdateInput,
  now: Date,
): SavingsGoal | null {
  const keys = (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).filter((k) => patch[k] !== undefined);
  const sets = [...keys.map((k) => `${COLUMNS[k]} = ?`), "updated_at = ?"];
  const values = [...keys.map((k) => patch[k] as string | number | null), now.toISOString()];
  if (patch.status !== undefined) {
    sets.push("paused_until = ?");
    values.push(patch.status === "paused" && patch.pauseMonths
      ? addMonthsToDate(todayVn(now), patch.pauseMonths)
      : null);
  }
  const res = goalsDb()
    .prepare(`UPDATE user_goals SET ${sets.join(", ")} WHERE cif = ? AND id = ?`)
    .run(...values, cif, id);
  return res.changes === 0 ? null : getGoal(cif, id);
}

/** Timed pauses whose resume date has come are switched back to active. Call before reading goals. */
export function resumeExpiredPauses(cif: string, now: Date): void {
  goalsDb()
    .prepare(
      `UPDATE user_goals SET status = 'active', paused_until = NULL, updated_at = ?
       WHERE cif = ? AND status = 'paused' AND paused_until IS NOT NULL AND paused_until <= ?`,
    )
    .run(now.toISOString(), cif, todayVn(now));
}

/** Deletes the goal and its ledger in one transaction; false when not found. */
export function deleteGoal(cif: string, id: string): boolean {
  const db = goalsDb();
  return db.transaction(() => {
    db.prepare("DELETE FROM user_goal_jars WHERE cif = ? AND goal_id = ?").run(cif, id);
    db.prepare("DELETE FROM user_goal_ledger WHERE cif = ? AND goal_id = ?").run(cif, id);
    db.prepare("DELETE FROM user_goal_reminders WHERE cif = ? AND goal_id = ?").run(cif, id);
    return db.prepare("DELETE FROM user_goals WHERE cif = ? AND id = ?").run(cif, id).changes > 0;
  })();
}
