import "server-only";

import type { GoalCreateInput, SavingsGoal } from "../model/types";
import { goalsDb } from "./db";
import { findGoalByRequestKey, insertGoal } from "./goals-repo";
import { appendLedger } from "./ledger-repo";

/** Inserts the goal and, when `openingAmount > 0`, its first deposit in one transaction. */
export function createGoalWithOpening(
  cif: string,
  input: GoalCreateInput,
  now: Date,
): SavingsGoal {
  return goalsDb().transaction(() => {
    const goal = insertGoal(cif, input, now);
    const jarId = `goaljar_${goal.id}`;
    goalsDb().prepare("INSERT INTO user_goal_jars (cif, id, goal_id, created_at) VALUES (?, ?, ?, ?)").run(cif, jarId, goal.id, now.toISOString());
    goalsDb().prepare("UPDATE user_goals SET jar_id = ? WHERE cif = ? AND id = ?").run(jarId, cif, goal.id);
    goal.jarId = jarId;
    if (input.openingAmount !== null && input.openingAmount > 0) {
      appendLedger(cif, goal.id, { kind: "deposit", amount: input.openingAmount, note: null }, now);
    }
    return goal;
  })();
}

/** Like `createGoalWithOpening`, but a known `requestKey` returns the old goal and writes nothing. */
export function createGoalOnce(
  cif: string,
  input: GoalCreateInput,
  now: Date,
): { goal: SavingsGoal; created: boolean } {
  return goalsDb().transaction(() => {
    const existing = input.requestKey ? findGoalByRequestKey(cif, input.requestKey) : null;
    if (existing) return { goal: existing, created: false };
    return { goal: createGoalWithOpening(cif, input, now), created: true };
  })();
}
