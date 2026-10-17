// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { GoalCreateInput } from "../../model/types";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { createGoalWithOpening } from "../create-goal";
import { goalsDb } from "../db";
import { deleteGoal, getGoal, insertGoal, listGoals, updateGoal } from "../goals-repo";
import { appendLedger, currentAmount, InsufficientGoalFundsError, listLedger } from "../ledger-repo";

const NOW = new Date("2026-09-15T00:00:00.000Z");
const LATER = new Date("2026-09-16T00:00:00.000Z");

function input(overrides: Partial<GoalCreateInput> = {}): GoalCreateInput {
  return {
    name: "Mua nhà",
    targetAmount: 600_000_000,
    targetDate: "2029-09-15",
    flexibility: "flexible",
    monthlyContribution: null,
    openingAmount: null,
    ...overrides,
  };
}

function count(table: string, cif?: string): number {
  const sql = cif ? `SELECT COUNT(*) AS n FROM ${table} WHERE cif = ?` : `SELECT COUNT(*) AS n FROM ${table}`;
  const row = cif
    ? (holder.db!.prepare(sql).get(cif) as { n: number })
    : (holder.db!.prepare(sql).get() as { n: number });
  return row.n;
}

beforeEach(() => {
  holder.db = new Database(":memory:");
});

describe("goals repo", () => {
  it("isolates rows by cif and lists every status oldest-first, including archived", () => {
    const older = insertGoal("A", input({ name: "Cũ" }), NOW);
    const newer = insertGoal("A", input({ name: "Mới" }), LATER);
    insertGoal("B", input({ name: "Người khác" }), NOW);
    updateGoal("A", older.id, { status: "archived" }, LATER);

    const listed = listGoals("A");
    expect(listed.map((g) => g.name)).toEqual(["Cũ", "Mới"]);
    expect(listed.map((g) => g.status)).toEqual(["archived", "active"]);
    expect(listed[0]?.id).toBe(older.id);
    expect(listed[1]?.id).toBe(newer.id);
    expect(listGoals("B").map((g) => g.name)).toEqual(["Người khác"]);
    expect(getGoal("A", newer.id)?.name).toBe("Mới");
    expect(getGoal("B", newer.id)).toBeNull();
  });

  it("updates only the patched fields and updatedAt, and returns null when the goal is missing", () => {
    const goal = insertGoal("A", input({ monthlyContribution: 1_000_000 }), NOW);
    const updated = updateGoal("A", goal.id, { name: "Xe" }, LATER);
    expect(updated).toMatchObject({
      id: goal.id,
      name: "Xe",
      targetAmount: 600_000_000,
      targetDate: "2029-09-15",
      flexibility: "flexible",
      monthlyContribution: 1_000_000,
      status: "active",
      jarId: null,
      source: "self_reported",
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    expect(updateGoal("A", goal.id, { monthlyContribution: null }, LATER)?.monthlyContribution).toBeNull();
    expect(updateGoal("A", "missing", { name: "Không" }, LATER)).toBeNull();
    expect(updateGoal("B", goal.id, { name: "Khác cif" }, LATER)).toBeNull();
    expect(getGoal("A", goal.id)?.name).toBe("Xe");
  });

  it("deletes the goal and its ledger, and returns false when nothing matches", () => {
    const goal = createGoalWithOpening("A", input({ openingAmount: 50_000 }), NOW);
    const other = createGoalWithOpening("B", input({ openingAmount: 20_000 }), NOW);
    expect(count("user_goal_ledger", "A")).toBe(1);
    expect(deleteGoal("A", goal.id)).toBe(true);
    expect(getGoal("A", goal.id)).toBeNull();
    expect(count("user_goal_ledger", "A")).toBe(0);
    expect(getGoal("B", other.id)?.name).toBe("Mua nhà");
    expect(count("user_goal_ledger", "B")).toBe(1);
    expect(deleteGoal("A", goal.id)).toBe(false);
    expect(deleteGoal("A", "missing")).toBe(false);
  });
});

describe("ledger repo", () => {
  it("computes currentAmount as deposits minus withdrawals, newest entry first", () => {
    const goal = insertGoal("A", input(), NOW);
    const deposit = appendLedger("A", goal.id, { kind: "deposit", amount: 80_000, note: null }, NOW);
    const withdraw = appendLedger(
      "A",
      goal.id,
      { kind: "withdraw", amount: 30_000, note: "ok" },
      LATER,
    );
    expect(currentAmount("A", goal.id)).toBe(50_000);
    expect(listLedger("A", goal.id).map((e) => e.id)).toEqual([withdraw.id, deposit.id]);
    expect(deposit).toMatchObject({
      goalId: goal.id,
      kind: "deposit",
      amount: 80_000,
      note: null,
      source: "self_reported",
      createdAt: NOW.toISOString(),
    });
    expect(deposit.id.startsWith("gled_")).toBe(true);
    expect(currentAmount("B", goal.id)).toBe(0);
    expect(listLedger("B", goal.id)).toEqual([]);
  });

  it("rejects a withdrawal above the balance and writes nothing", () => {
    const goal = insertGoal("A", input(), NOW);
    appendLedger("A", goal.id, { kind: "deposit", amount: 40_000, note: null }, NOW);
    expect(() =>
      appendLedger("A", goal.id, { kind: "withdraw", amount: 40_001, note: "quá" }, LATER),
    ).toThrow(InsufficientGoalFundsError);
    try {
      appendLedger("A", goal.id, { kind: "withdraw", amount: 40_001, note: "quá" }, LATER);
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientGoalFundsError);
      expect((error as InsufficientGoalFundsError).available).toBe(40_000);
      expect((error as InsufficientGoalFundsError).requested).toBe(40_001);
    }
    expect(currentAmount("A", goal.id)).toBe(40_000);
    expect(listLedger("A", goal.id)).toHaveLength(1);

    const exact = appendLedger("A", goal.id, { kind: "withdraw", amount: 40_000, note: "hết" }, LATER);
    expect(exact.amount).toBe(40_000);
    expect(currentAmount("A", goal.id)).toBe(0);
  });
});

describe("createGoalWithOpening", () => {
  it("writes exactly one deposit when openingAmount > 0, and none for null or 0", () => {
    const opened = createGoalWithOpening("A", input({ openingAmount: 25_000 }), NOW);
    expect(opened.id.startsWith("goal_")).toBe(true);
    expect(currentAmount("A", opened.id)).toBe(25_000);
    expect(listLedger("A", opened.id)).toEqual([
      expect.objectContaining({ kind: "deposit", amount: 25_000, note: null }),
    ]);

    const empty = createGoalWithOpening("A", input({ openingAmount: null }), NOW);
    const zero = createGoalWithOpening("A", input({ openingAmount: 0 }), NOW);
    expect(listLedger("A", empty.id)).toEqual([]);
    expect(listLedger("A", zero.id)).toEqual([]);
    expect(currentAmount("A", empty.id)).toBe(0);
  });

  it("rolls back the goal when the opening deposit fails", () => {
    goalsDb();
    holder.db!.exec(`
      CREATE TRIGGER goal_ledger_fail BEFORE INSERT ON user_goal_ledger
      BEGIN
        SELECT RAISE(ABORT, 'boom');
      END;
    `);
    expect(() => createGoalWithOpening("A", input({ openingAmount: 10_000 }), NOW)).toThrow(/boom/);
    expect(listGoals("A")).toEqual([]);
    expect(count("user_goals")).toBe(0);
    expect(count("user_goal_ledger")).toBe(0);
  });
});
