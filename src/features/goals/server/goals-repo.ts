import "server-only";

import { randomUUID } from "node:crypto";
import type {
  GoalCreateInput,
  GoalStatus,
  GoalUpdateInput,
  SavingsGoal,
} from "../model/types";
import { goalsDb } from "./db";

interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  target_date: string;
  flexibility: SavingsGoal["flexibility"];
  monthly_contribution: number | null;
  status: GoalStatus;
  jar_id: string | null;
  created_at: string;
  updated_at: string;
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
         monthly_contribution, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(cif, id, input.name, input.targetAmount, input.targetDate, input.flexibility,
      input.monthlyContribution, ts, ts);
  return getGoal(cif, id)!;
}

const COLUMNS: Record<keyof GoalUpdateInput, string> = {
  name: "name",
  targetAmount: "target_amount",
  targetDate: "target_date",
  flexibility: "flexibility",
  monthlyContribution: "monthly_contribution",
  status: "status",
};

/** Applies only the fields present in `patch`; null when the goal does not exist. */
export function updateGoal(
  cif: string,
  id: string,
  patch: GoalUpdateInput,
  now: Date,
): SavingsGoal | null {
  const keys = (Object.keys(patch) as (keyof GoalUpdateInput)[]).filter(
    (k) => patch[k] !== undefined && k in COLUMNS,
  );
  const sets = [...keys.map((k) => `${COLUMNS[k]} = ?`), "updated_at = ?"];
  const values = [...keys.map((k) => patch[k] as string | number | null), now.toISOString()];
  const res = goalsDb()
    .prepare(`UPDATE user_goals SET ${sets.join(", ")} WHERE cif = ? AND id = ?`)
    .run(...values, cif, id);
  return res.changes === 0 ? null : getGoal(cif, id);
}

/** Deletes the goal and its ledger in one transaction; false when not found. */
export function deleteGoal(cif: string, id: string): boolean {
  const db = goalsDb();
  return db.transaction(() => {
    db.prepare("DELETE FROM user_goal_ledger WHERE cif = ? AND goal_id = ?").run(cif, id);
    return db.prepare("DELETE FROM user_goals WHERE cif = ? AND id = ?").run(cif, id).changes > 0;
  })();
}
