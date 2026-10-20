// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { CIF, goalInput, openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { addMonths } from "../../engine/dates";
import { applyAction, getWorld, parseGoalAction } from "../goal-service";

process.env.AGENT_MODE = "mock";

const ms = (over: Record<string, unknown> = {}) => ({ month: 0, kind: "reserve", title: "Giữ quỹ dự phòng", ...over });
const input = (goalId: string, over: Record<string, unknown> = {}) => ({
  type: "setRoadmap",
  goalId,
  planId: "optimized",
  planName: "Kết hợp tối ưu",
  milestones: [ms()],
  ...over,
});

describe("setRoadmap: kế hoạch từ chat thành lộ trình của mục tiêu", () => {
  let fx: GoalFixture;
  let goalId: string;
  let seq = 0;
  const rid = () => `roadmap-${++seq}`;
  const goalOf = (id = goalId) => getWorld(CIF).world.goals.find((g) => g.id === id)!;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
    const created = applyAction(CIF, rid(), { type: "createGoal", input: goalInput("Roadmap goal") });
    expect(created.ok).toBe(true);
    goalId = getWorld(CIF).world.goals.at(-1)!.id;
  });
  afterAll(() => fx.close());

  it("parse: nhận payload đúng, dựng action sạch (bỏ trường thừa)", () => {
    const r = parseGoalAction(input("g1", { extra: 1, milestones: [ms({ endMonth: 3, month: 1, detail: "d", action: "a", junk: 1 })] }));
    expect(r).toEqual({
      ok: true,
      action: {
        type: "setRoadmap",
        goalId: "g1",
        planId: "optimized",
        planName: "Kết hợp tối ưu",
        milestones: [{ month: 1, endMonth: 3, kind: "reserve", title: "Giữ quỹ dự phòng", detail: "d", action: "a" }],
      },
    });
  });

  const bad: [string, unknown][] = [
    ["goalId rỗng", input("")],
    ["0 mốc", input("g", { milestones: [] })],
    ["11 mốc", input("g", { milestones: Array.from({ length: 11 }, () => ms()) })],
    ["mốc không phải object", input("g", { milestones: ["x"] })],
    ["kind lạ", input("g", { milestones: [ms({ kind: "jump" })] })],
    ["month âm", input("g", { milestones: [ms({ month: -1 })] })],
    ["month 481", input("g", { milestones: [ms({ month: 481 })] })],
    ["month không nguyên", input("g", { milestones: [ms({ month: 1.5 })] })],
    ["month là chuỗi", input("g", { milestones: [ms({ month: "3" })] })],
    ["endMonth < month", input("g", { milestones: [ms({ month: 5, endMonth: 4 })] })],
    ["endMonth 481", input("g", { milestones: [ms({ month: 5, endMonth: 481 })] })],
    ["title rỗng", input("g", { milestones: [ms({ title: "" })] })],
    ["title 61 ký tự", input("g", { milestones: [ms({ title: "x".repeat(61) })] })],
    ["detail 201 ký tự", input("g", { milestones: [ms({ detail: "x".repeat(201) })] })],
    ["action 121 ký tự", input("g", { milestones: [ms({ action: "x".repeat(121) })] })],
    ["planName 41 ký tự", input("g", { planName: "x".repeat(41) })],
    ["planName rỗng", input("g", { planName: "" })],
    ["planId lạ", input("g", { planId: "other" })],
  ];
  it.each(bad)("parse từ chối: %s", (_label, raw) => {
    expect(parseGoalAction(raw).ok).toBe(false);
  });

  it("parse: biên hợp lệ (60/200/120/40 ký tự, 10 mốc, month 0 và 480)", () => {
    const r = parseGoalAction(input("g", {
      planName: "x".repeat(40),
      milestones: Array.from({ length: 10 }, (_, i) => ms({ month: i === 9 ? 480 : i, title: "x".repeat(60), detail: "y".repeat(200), action: "z".repeat(120) })),
    }));
    expect(r.ok).toBe(true);
  });

  it("lưu lộ trình với ngày = hôm nay + month tháng; endDate từ endMonth; chosenAt = hôm nay", () => {
    const today = getWorld(CIF).world.clock.today;
    const r = applyAction(CIF, rid(), input(goalId, {
      milestones: [
        ms({ month: 0, title: "Bắt đầu" }),
        ms({ month: 1, endMonth: 12, kind: "save", title: "Tiết kiệm", detail: "Góp đều", action: "Bật trích tự động" }),
        ms({ month: 12, kind: "buy", title: "Mua" }),
      ],
    }));
    expect(r.ok).toBe(true);
    const roadmap = goalOf().roadmap!;
    expect(roadmap).toEqual({
      planId: "optimized",
      planName: "Kết hợp tối ưu",
      chosenAt: today,
      milestones: [
        { date: today, kind: "reserve", title: "Bắt đầu" },
        { date: addMonths(today, 1), endDate: addMonths(today, 12), kind: "save", title: "Tiết kiệm", detail: "Góp đều", action: "Bật trích tự động" },
        { date: addMonths(today, 12), kind: "buy", title: "Mua" },
      ],
    });
  });

  it("chọn lại thay thế lộ trình cũ; lộ trình còn sau khi đọc lại từ DB", () => {
    const r = applyAction(CIF, rid(), input(goalId, { planId: "no_loan", planName: "Không vay", milestones: [ms({ month: 3, kind: "done", title: "Xong" })] }));
    expect(r.ok).toBe(true);
    const roadmap = goalOf().roadmap!;
    expect(roadmap.planId).toBe("no_loan");
    expect(roadmap.milestones).toHaveLength(1);
    expect(roadmap.milestones[0].kind).toBe("done");
  });

  it("từ chối: không có mục tiêu, payload hỏng — không ghi gì, trả lỗi thường", () => {
    const before = JSON.stringify(goalOf().roadmap);
    const missing = applyAction(CIF, rid(), input("goal-khong-co"));
    expect(missing.ok).toBe(false);
    expect(missing).toHaveProperty("error");
    const badInput = applyAction(CIF, rid(), input(goalId, { milestones: [ms({ month: 999 })] }));
    expect(badInput.ok).toBe(false);
    expect(JSON.stringify(goalOf().roadmap)).toBe(before);
  });

  it("từ chối khi mục tiêu đã đóng", () => {
    const created = applyAction(CIF, rid(), { type: "createGoal", input: goalInput("Se dong") });
    expect(created.ok).toBe(true);
    const id = getWorld(CIF).world.goals.at(-1)!.id;
    expect(applyAction(CIF, rid(), { type: "closeGoal", goalId: id }).ok).toBe(true);
    const r = applyAction(CIF, rid(), input(id));
    expect(r.ok).toBe(false);
    expect(goalOf(id).roadmap).toBeUndefined();
  });
});
