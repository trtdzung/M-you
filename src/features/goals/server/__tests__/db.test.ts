// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { ensureGoalTables, goalsDb } from "../db";

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

beforeEach(() => {
  holder.db = new Database(":memory:");
});

describe("ensureGoalTables", () => {
  it("can be called twice and creates the goal, ledger and reminder tables plus the ledger index", () => {
    const db = holder.db!;
    ensureGoalTables(db);
    ensureGoalTables(db);
    expect(tableNames(db)).toEqual(["user_goal_jars", "user_goal_ledger", "user_goal_reminders", "user_goals"]);
    const index = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get("idx_user_goal_ledger_goal") as { name: string } | undefined;
    expect(index?.name).toBe("idx_user_goal_ledger_goal");
  });

  it("rejects a bad flexibility, a non-positive target, a bad status, and a non-positive ledger amount", () => {
    const db = holder.db!;
    ensureGoalTables(db);
    const insertGoal = db.prepare(
      `INSERT INTO user_goals (cif, id, name, target_amount, target_date, flexibility, status, created_at, updated_at)
       VALUES ('c', 'g', 'n', ?, '2029-09-15', ?, ?, '2026-09-15T00:00:00.000Z', '2026-09-15T00:00:00.000Z')`,
    );
    expect(() => insertGoal.run(0, "flexible", "active")).toThrow(/CHECK/);
    expect(() => insertGoal.run(-1, "flexible", "active")).toThrow(/CHECK/);
    expect(() => insertGoal.run(1, "loose", "active")).toThrow(/CHECK/);
    expect(() => insertGoal.run(1, "flexible", "done")).toThrow(/CHECK/);

    db.prepare(
      `INSERT INTO user_goals (cif, id, name, target_amount, target_date, flexibility, status, created_at, updated_at)
       VALUES ('c', 'g', 'n', 1, '2029-09-15', 'fixed', 'active', '2026-09-15T00:00:00.000Z', '2026-09-15T00:00:00.000Z')`,
    ).run();
    const insertLedger = db.prepare(
      `INSERT INTO user_goal_ledger (cif, id, goal_id, kind, amount, created_at)
       VALUES ('c', 'e', 'g', 'deposit', ?, '2026-09-15T00:00:00.000Z')`,
    );
    expect(() => insertLedger.run(0)).toThrow(/CHECK/);
    expect(() => insertLedger.run(-5)).toThrow(/CHECK/);
  });
});

describe("goalsDb", () => {
  it("creates the tables once per database instance", () => {
    const first = holder.db!;
    goalsDb();
    expect(tableNames(first)).toContain("user_goals");
    first.exec("DROP TABLE user_goals");
    goalsDb();
    expect(tableNames(first)).not.toContain("user_goals");

    holder.db = new Database(":memory:");
    goalsDb();
    expect(tableNames(holder.db)).toContain("user_goals");
    expect(tableNames(holder.db)).toContain("user_goal_ledger");
  });
});
