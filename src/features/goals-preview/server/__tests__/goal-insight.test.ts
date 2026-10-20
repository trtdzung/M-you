// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database as Db } from "better-sqlite3";
import { CIF, goalInput, openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { applyAction } from "../goal-service";
import { MAX_AGE_MS, RETRY_MS, peekGoalInsight, readAllGoalInsights, readGoalInsight, settleGoalInsights, type AgentAnswer } from "../goal-insight";

process.env.AGENT_MODE = "mock";

const card = (goalId: string): AgentAnswer => ({
  insight: { goalId, goalName: "G", observation: "Bạn có 5.000.000 VND nằm yên.", suggestion: "Gửi tiết kiệm MSB 6 tháng.", question: "Mình nên gửi tiết kiệm MSB 6 tháng thế nào?" },
  fingerprint: "fp-1",
  unchanged: false,
});

describe("readGoalInsight", () => {
  let fx: GoalFixture;
  let gid = "";

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
    const created = applyAction(CIF, "gi-create", { type: "createGoal", input: { ...goalInput("gi"), initialDeposit: 50_000 } });
    gid = created.ok ? created.createdGoalId! : "";
  });
  afterAll(() => fx.close());

  it("lần đầu chưa có bản nào: trả rỗng + refreshing, rồi bản lưu sau khi agent trả lời", async () => {
    const ask = vi.fn(async () => card(gid));
    expect(readGoalInsight(CIF, gid, ask)).toEqual({ insight: null, refreshing: true });
    await settleGoalInsights();
    expect(ask).toHaveBeenCalledWith(CIF, gid, null);
    const second = readGoalInsight(CIF, gid, ask);
    expect(second.refreshing).toBe(false);
    expect(second.insight?.observation).toContain("5.000.000");
    expect(second.insight?.question).toBe("Mình nên gửi tiết kiệm MSB 6 tháng thế nào?");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("không đổi gì thì không hỏi lại agent", async () => {
    const ask = vi.fn(async () => card(gid));
    expect(readGoalInsight(CIF, gid, ask).refreshing).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("có thao tác trên mục tiêu thì hỏi lại kèm fingerprint cũ; agent báo unchanged thì giữ bản cũ", async () => {
    expect(applyAction(CIF, "gi-dep", { type: "deposit", goalId: gid, amount: 1000 }).ok).toBe(true);
    const ask = vi.fn(async (): Promise<AgentAnswer> => ({ insight: null, fingerprint: "fp-1", unchanged: true }));
    const r = readGoalInsight(CIF, gid, ask);
    expect(r.refreshing).toBe(true);
    expect(r.insight?.suggestion).toContain("MSB");
    await settleGoalInsights();
    expect(ask).toHaveBeenCalledWith(CIF, gid, "fp-1");
    expect(readGoalInsight(CIF, gid, ask).refreshing).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("quá 24 giờ thì coi là cũ", async () => {
    const ask = vi.fn(async () => card(gid));
    const later = () => Date.now() + MAX_AGE_MS + 1000;
    expect(readGoalInsight(CIF, gid, ask, later).refreshing).toBe(true);
    await settleGoalInsights();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("agent lỗi: giữ bản cũ, không thử lại trước RETRY_MS", async () => {
    expect(applyAction(CIF, "gi-dep2", { type: "deposit", goalId: gid, amount: 1000 }).ok).toBe(true);
    const ask = vi.fn(async (): Promise<AgentAnswer> => {
      throw new Error("down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readGoalInsight(CIF, gid, ask).refreshing).toBe(true);
    await settleGoalInsights();
    const after = readGoalInsight(CIF, gid, ask);
    expect(after).toMatchObject({ refreshing: false });
    expect(after.insight?.suggestion).toContain("MSB");
    expect(ask).toHaveBeenCalledTimes(1);
    readGoalInsight(CIF, gid, ask, () => Date.now() + RETRY_MS + 1000);
    await settleGoalInsights();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("peek chỉ đọc bản đã lưu và không khởi động làm mới", async () => {
    const ask = vi.fn(async () => card(gid));
    expect(peekGoalInsight(CIF, gid)?.question).toContain("tiết kiệm");
    expect(peekGoalInsight(CIF, "nope")).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it("mục tiêu không có thì RangeError", () => {
    expect(() => readGoalInsight(CIF, "nope", vi.fn())).toThrow(RangeError);
  });

  it("readAllGoalInsights: thẻ của mọi mục tiêu đang theo đuổi trong một lần đọc", async () => {
    const ask = vi.fn(async (_cif: string, goalId: string) => card(goalId));
    const first = readAllGoalInsights(CIF, ask);
    expect(first.refreshing).toBe(true);
    expect(Object.keys(first.insights)).toContain(gid);
    await settleGoalInsights();
    const again = readAllGoalInsights(CIF, ask);
    expect(again.refreshing).toBe(false);
    expect(again.insights[gid]?.observation).toContain("5.000.000 VND");
  });
});
