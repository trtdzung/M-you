// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { CIF, goalInput, openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { applyAction, parseGoalAction } from "../goal-service";

process.env.AGENT_MODE = "mock";

describe("F1 parseGoalAction / applyAction", () => {
  let fx: GoalFixture;
  let seq = 0;
  const rid = (label: string) => `f1-${label}-${++seq}`;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  it("từ chối world/sync, hydrate, reset, loadScenario, nav/*, toast/*, dismissSuggestion, type lạ", () => {
    const rejected = [
      { type: "world/sync" },
      { type: "hydrate" },
      { type: "reset" },
      { type: "loadScenario" },
      { type: "setFundPriceShift", pct: 10 },
      { type: "triggerEvent", event: "salary" },
      { type: "setCustomer" },
      { type: "nav/push" },
      { type: "toast/push" },
      { type: "dismissSuggestion" },
      { type: "unknown-action" },
    ];
    for (const action of rejected) {
      const parsed = parseGoalAction(action);
      expect(parsed.ok, action.type).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error).toMatch(/không dùng được|không hợp lệ/i);
      }
      const before = fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_action_log WHERE cif = ?").get(CIF) as { n: number };
      const result = applyAction(CIF, rid(action.type), action);
      expect(result.ok).toBe(false);
      const after = fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_action_log WHERE cif = ?").get(CIF) as { n: number };
      expect(after.n, action.type).toBe(before.n);
    }
  });

  it("trường sai kiểu → 422 / không ghi log", () => {
    const invalid = [
      { type: "deposit", goalId: "x", amount: Infinity },
      { type: "advanceTime", days: 0 },
      { type: "deposit", goalId: "x", amount: -1 },
      { type: "createGoal", input: { ...goalInput(), targetAmount: 0 } },
    ];
    for (const action of invalid) {
      expect(parseGoalAction(action).ok, JSON.stringify(action)).toBe(false);
      const before = fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_action_log WHERE cif = ?").get(CIF) as { n: number };
      const result = applyAction(CIF, rid(`bad-${action.type}`), action);
      expect(result.ok).toBe(false);
      const after = fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_action_log WHERE cif = ?").get(CIF) as { n: number };
      expect(after.n).toBe(before.n);
    }
  });

  it("payload UI thật: createGoal, huỷ trích amount=0, tài sản countPercent=0, maturity toCash → parse ok", () => {
    const uiActions = [
      { type: "createGoal", input: goalInput("UI create") },
      { type: "setStandingOrder", goalId: "goal-1", amount: 0, dayOfMonth: 1, active: false },
      {
        type: "addAsset",
        goalId: "goal-1",
        name: "gold",
        category: "gold",
        value: 0,
        countPercent: 0,
        instrumentId: "gold-sjc",
        quantity: 1,
        source: "estimated",
        valuationDate: "2026-10-17",
      },
      { type: "handleMaturity", assetId: "a", choice: "toCash" },
    ];
    for (const action of uiActions) {
      const parsed = parseGoalAction(action);
      expect(parsed.ok, action.type).toBe(true);
    }
  });

  it("createGoal hợp lệ ghi world và trả createdGoalId", () => {
    const result = applyAction(CIF, rid("create-ok"), { type: "createGoal", input: goalInput("F1 ok") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.createdGoalId).toBe("string");
    expect(result.createdGoalId!.length).toBeGreaterThan(0);
    expect(result.world.goals.some((g) => g.id === result.createdGoalId)).toBe(true);
  });
});
