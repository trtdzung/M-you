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

  it("addAsset nhận đủ chín loại tài sản đúng như thẻ gửi, mỗi loại thành tài sản tự khai đúng nhóm", () => {
    const created = applyAction(CIF, "assets9-goal", { type: "createGoal", input: goalInput("chín loại") });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const goalId = created.createdGoalId!;
    const hand = (category: string, value: number) => ({ category, value, source: "self_reported" });
    const market = (category: string, instrumentId: string, quantity: number) => ({ category, value: 0, source: "estimated", instrumentId, quantity });
    const accrual = (category: string, principal: number, ratePa: number, startDate: string, maturityDate?: string) => ({
      category, value: principal, source: "estimated", accrual: { principal, ratePa, startDate, ...(maturityDate ? { maturityDate } : {}) },
    });
    const cases = [
      hand("house", 2_000_000_000), hand("car", 600_000_000), hand("motorbike", 30_000_000), hand("other", 80_000_000),
      market("gold", "gold-ring", 2), market("stock", "stock-acb", 1000), market("external_fund", "fund-AEIF", 500),
      accrual("deposit", 50_000_000, 5.2, "2026-06-01", "2027-06-01"), accrual("bond", 100_000_000, 9, "2026-03-01", "2029-03-01"),
    ];
    for (const extra of cases) {
      const r = applyAction(CIF, `assets9-${extra.category}`, { type: "addAsset", goalId, name: `Tài sản ${extra.category}`, countPercent: 80, ...extra });
      expect(r.ok, `${extra.category}: ${r.ok ? "" : r.error}`).toBe(true);
      if (!r.ok) return;
      const asset = r.world.assets.find((a) => a.goalId === goalId && a.category === extra.category);
      expect(asset, extra.category).toMatchObject({ type: "declared", category: extra.category, countPercent: 80, status: "held" });
      if ("instrumentId" in extra && "quantity" in extra) expect(asset).toMatchObject({ instrumentId: extra.instrumentId, quantity: extra.quantity });
      if ("accrual" in extra) expect(asset).toMatchObject({ accrual: extra.accrual });
    }
    expect(applyAction(CIF, "assets9-bad", { type: "addAsset", goalId, name: "x", category: "crypto", value: 1, countPercent: 10 }).ok).toBe(false);
  });
});
