import "server-only";

import { randomUUID } from "node:crypto";
import type { GoalLedgerEntry, LedgerEntryInput } from "../model/types";
import { goalsDb } from "./db";

/** Thrown when a withdrawal exceeds what the goal currently holds. */
export class InsufficientGoalFundsError extends Error {
  constructor(readonly available: number, readonly requested: number) {
    super("Withdrawal exceeds current goal amount");
    this.name = "InsufficientGoalFundsError";
  }
}

interface LedgerRow {
  id: string;
  goal_id: string;
  kind: GoalLedgerEntry["kind"];
  amount: number;
  note: string | null;
  created_at: string;
}

function toEntry(r: LedgerRow): GoalLedgerEntry {
  return {
    id: r.id,
    goalId: r.goal_id,
    kind: r.kind,
    amount: r.amount,
    note: r.note,
    createdAt: r.created_at,
    source: "self_reported",
  };
}

/** Newest first. */
export function listLedger(cif: string, goalId: string): GoalLedgerEntry[] {
  const rows = goalsDb()
    .prepare(
      "SELECT * FROM user_goal_ledger WHERE cif = ? AND goal_id = ? ORDER BY created_at DESC, rowid DESC",
    )
    .all(cif, goalId) as LedgerRow[];
  return rows.map(toEntry);
}

/** Σ deposit − Σ withdraw; never stored. */
export function currentAmount(cif: string, goalId: string): number {
  const row = goalsDb()
    .prepare(
      `SELECT COALESCE(SUM(CASE kind WHEN 'deposit' THEN amount ELSE -amount END), 0) AS total
       FROM user_goal_ledger WHERE cif = ? AND goal_id = ?`,
    )
    .get(cif, goalId) as { total: number };
  return row.total;
}

/** Appends one entry; a withdrawal above `currentAmount` throws `InsufficientGoalFundsError`. */
export function appendLedger(
  cif: string,
  goalId: string,
  entry: LedgerEntryInput,
  now: Date,
): GoalLedgerEntry {
  const db = goalsDb();
  return db.transaction(() => {
    if (entry.kind === "withdraw") {
      const available = currentAmount(cif, goalId);
      if (entry.amount > available) throw new InsufficientGoalFundsError(available, entry.amount);
    }
    const id = `gled_${randomUUID()}`;
    db.prepare(
      `INSERT INTO user_goal_ledger (cif, id, goal_id, kind, amount, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(cif, id, goalId, entry.kind, entry.amount, entry.note, now.toISOString());
    return toEntry(
      db.prepare("SELECT * FROM user_goal_ledger WHERE cif = ? AND id = ?").get(cif, id) as LedgerRow,
    );
  })();
}
