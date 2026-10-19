// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database as Db } from "better-sqlite3";
import { CIF, goalInput, openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { goalAccountNumber } from "../../engine/ledger";
import { applyAction } from "../goal-service";

process.env.AGENT_MODE = "mock";

describe("số tài khoản dự kiến ở màn tạo khớp số server cấp", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  it("goalAccountNumber(cif, seq + 2) bằng số thật sau createGoal", () => {
    const probe = applyAction(CIF, "num-probe", { type: "setRiskProfile", profile: "balanced" });
    expect(probe.ok).toBe(true);
    if (!probe.ok) return;
    const preview = goalAccountNumber(probe.world.customer.cif, probe.world.seq + 2);
    const created = applyAction(CIF, "num-create", { type: "createGoal", input: goalInput("num") });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const real = created.world.accounts.find((a) => a.goalId === created.createdGoalId)?.number;
    expect(real).toBe(preview);
    expect(real).toMatch(/^88\d{10}$/);
  });

  it("createGoal kèm tài sản có sẵn: lưu tài sản vào mục tiêu mới và từ chối tài sản sai kiểu", () => {
    const asset = { name: "Xe", category: "car", value: 500_000_000, countPercent: 80 };
    const ok = applyAction(CIF, "assets-create", { type: "createGoal", input: { ...goalInput("with assets"), assets: [asset] } });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const mine = ok.world.assets.filter((a) => a.goalId === ok.createdGoalId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: "declared", name: "Xe", countPercent: 80 });

    const bad = applyAction(CIF, "assets-bad", { type: "createGoal", input: { ...goalInput("bad"), assets: [{ ...asset, category: "nope" }] } });
    expect(bad.ok).toBe(false);
  });
});
