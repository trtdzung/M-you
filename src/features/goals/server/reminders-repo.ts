import "server-only";

import { randomUUID } from "node:crypto";
import type { GoalReminder, ReminderDecision, ReminderMilestone } from "../model/reminder-types";
import { goalsDb } from "./db";

interface Row {
  id: string;
  goal_id: string;
  kind: GoalReminder["kind"];
  payload: string;
  created_at: string;
  dismissed_at: string | null;
}

function toReminder(r: Row): GoalReminder {
  const p = JSON.parse(r.payload) as Pick<GoalReminder, "milestone" | "amount" | "levers">;
  return { id: r.id, goalId: r.goal_id, kind: r.kind, createdAt: r.created_at, milestone: p.milestone, amount: p.amount, levers: p.levers };
}

/** Newest note for the goal, dismissed or not. */
export function lastReminder(cif: string, goalId: string): { reminder: GoalReminder; dismissed: boolean } | null {
  const row = goalsDb()
    .prepare("SELECT * FROM user_goal_reminders WHERE cif = ? AND goal_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(cif, goalId) as Row | undefined;
  return row ? { reminder: toReminder(row), dismissed: row.dismissed_at !== null } : null;
}

/** Milestones already celebrated for this goal. */
export function notifiedMilestones(cif: string, goalId: string): ReminderMilestone[] {
  const rows = goalsDb()
    .prepare("SELECT payload FROM user_goal_reminders WHERE cif = ? AND goal_id = ? AND kind = 'milestone'")
    .all(cif, goalId) as { payload: string }[];
  return rows.map((r) => (JSON.parse(r.payload) as { milestone: ReminderMilestone }).milestone);
}

export function insertReminder(cif: string, goalId: string, decision: ReminderDecision, now: Date): GoalReminder {
  const id = `rem_${randomUUID()}`;
  const createdAt = now.toISOString();
  const { kind, ...payload } = decision;
  goalsDb()
    .prepare("INSERT INTO user_goal_reminders (cif, id, goal_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(cif, id, goalId, kind, JSON.stringify(payload), createdAt);
  return { id, goalId, kind, createdAt, ...payload };
}

export function dismissReminder(cif: string, id: string, now: Date): boolean {
  return goalsDb().prepare("UPDATE user_goal_reminders SET dismissed_at = ? WHERE cif = ? AND id = ? AND dismissed_at IS NULL").run(now.toISOString(), cif, id).changes > 0;
}
