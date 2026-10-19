// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as Db } from "better-sqlite3";
import { CIF, goalInput, openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { needsGoalAccountMigration, rebuildAccountsForGoal } from "@/lib/db-migrate-goal-account";
import { readEngineClock } from "@/lib/security/clock";
import { ensureGoalV2Tables } from "../db";
import { applyAction } from "../goal-service";

process.env.AGENT_MODE = "mock";

describe("R2 advanceTime rollback; R3 số TK; migration accounts", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  it("R2: xử lý bù lỗi → rollback đồng hồ và không ghi action_log; retry sau vẫn ok", () => {
    const created = applyAction(CIF, "r2-create", { type: "createGoal", input: goalInput("r2") });
    expect(created.ok).toBe(true);
    const gid = created.ok ? created.createdGoalId! : "";
    expect(applyAction(CIF, "r2-open", { type: "openAccount", goalId: gid, initialDeposit: 50_000 }).ok).toBe(true);
    expect(applyAction(CIF, "r2-so", { type: "setStandingOrder", goalId: gid, amount: 100, dayOfMonth: 5 }).ok).toBe(
      true,
    );

    const snap = () => ({
      offset: readEngineClock(CIF).offsetMs,
      meta: fx.db.prepare("SELECT processed_through AS p FROM gv2_meta WHERE cif = ?").get(CIF) as { p: string | null },
      n: (fx.db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n,
      log: (
        fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_action_log WHERE request_id = 'r2-fault-advance'").get() as {
          n: number;
        }
      ).n,
    });
    const before = snap();
    fx.db.exec(
      "CREATE TRIGGER r2_advance_fail BEFORE INSERT ON transactions BEGIN SELECT RAISE(ABORT, 'advance injected'); END",
    );
    let error: string | undefined;
    try {
      applyAction(CIF, "r2-fault-advance", { type: "advanceTime", days: 40 });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      fx.db.exec("DROP TRIGGER IF EXISTS r2_advance_fail");
    }
    expect(error).toBeTruthy();
    const after = snap();
    expect(after.offset).toBe(before.offset);
    expect(after.meta).toEqual(before.meta);
    expect(after.n).toBe(before.n);
    expect(after.log).toBe(0);

    expect(applyAction(CIF, "r2-fault-advance", { type: "advanceTime", days: 40 }).ok).toBe(true);
    expect(readEngineClock(CIF).offsetMs).toBeGreaterThan(before.offset);
  });

  it("R3: số TK D10 trùng toàn hệ thống → tăng seq tới khi trống", () => {
    const created = applyAction(CIF, "r3-create", { type: "createGoal", input: goalInput("collision") });
    expect(created.ok).toBe(true);
    const gid = created.ok ? created.createdGoalId! : "";
    const world = created.ok ? created.world : null;
    const expected =
      "88" +
      CIF.replace(/\D/g, "").slice(-4).padStart(4, "0") +
      String((world!.seq + 1) % 1_000_000).padStart(6, "0");
    fx.db
      .prepare(
        `INSERT INTO gv2_goal_accounts (cif, account_id, goal_id, number, name, interest_rate_pa, opened_at, closed_at)
         VALUES ('synthetic_10001', 'dummy', 'dummy', ?, 'collision', 0, '2026-01-01', '2026-01-02')`,
      )
      .run(expected);
    const opened = applyAction(CIF, "r3-open", { type: "openAccount", goalId: gid, initialDeposit: 0 });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const number = opened.world.accounts.find((a) => a.goalId === gid)?.number;
    expect(number).toBeTruthy();
    expect(number).not.toBe(expected);
  });

  it("migration accounts thêm 'goal' idempotent, giữ nguyên dữ liệu", () => {
    const row = fx.db.prepare("SELECT * FROM accounts WHERE type = 'current' LIMIT 1").get() as Record<string, unknown>;
    const schema = (
      fx.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get() as { sql: string }
    ).sql.replace(", 'goal'", "");
    const old = new Database(":memory:");
    old.exec(schema);
    const cols = Object.keys(row);
    old.prepare(`INSERT INTO accounts (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(
      ...cols.map((c) => row[c]),
    );
    const before = old.prepare("SELECT * FROM accounts").all();
    expect(needsGoalAccountMigration(old)).toBe(true);
    rebuildAccountsForGoal(old);
    expect(needsGoalAccountMigration(old)).toBe(false);
    rebuildAccountsForGoal(old);
    expect(needsGoalAccountMigration(old)).toBe(false);
    const after = old.prepare("SELECT * FROM accounts").all();
    expect(after).toHaveLength(before.length);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    old.close();
  });

  it("ensureGoalV2Tables idempotent (cột created_goal_id)", () => {
    ensureGoalV2Tables(fx.db);
    ensureGoalV2Tables(fx.db);
    const cols = fx.db.prepare("PRAGMA table_info(gv2_action_log)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("created_goal_id");
  });
});
