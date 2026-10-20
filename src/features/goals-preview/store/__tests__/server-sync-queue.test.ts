// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { CIF, goalInput, openGoalFixtureDb, type GoalFixture } from "../../server/__tests__/helpers/goal-test-db";
import type { PreviewState } from "../../model/state";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { POST } from "@/app/api/goals-v2/actions/route";
import { applyAction, getWorld } from "../../server/goal-service";
import { initialPreviewState, previewReducer } from "../reducer";
import { ActionQueue } from "../server-sync";

process.env.AGENT_MODE = "mock";

const create = (name: string) => ({ type: "createGoal" as const, input: goalInput(name) });

function postActions(body: string) {
  return POST(new NextRequest("http://test/api/goals-v2/actions", { method: "POST", body }));
}

describe("Store queue N2/N3 + createdGoalId + navSeq (F6)", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  it("F6: navSeq tách khỏi seq; world/sync giữ lastCreatedGoalId đúng id server", () => {
    let local: PreviewState = {
      ...structuredClone(getWorld(CIF).world),
      nav: { stack: [] },
      toasts: [],
      navSeq: 0,
    };
    const seq0 = local.seq;
    local = previewReducer(local, { type: "nav/push", screen: "GoalList" });
    local = previewReducer(local, { type: "toast/push", message: "x" });
    expect(local.seq).toBe(seq0);
    expect(local.navSeq ?? 0).toBeGreaterThan(0);

    local = previewReducer(local, create("f6"));
    const r = applyAction(CIF, "f6-create", create("f6"));
    expect(r.ok).toBe(true);
    const gid = r.ok ? r.createdGoalId! : "";
    local = previewReducer(local, { type: "world/sync", world: r.ok ? r.world : local });
    expect(local.lastCreatedGoalId).toBe(gid);
    expect(local.goals.some((g) => g.id === local.lastCreatedGoalId)).toBe(true);

    const empty = initialPreviewState();
    expect(empty.goals).toHaveLength(0);
    expect(empty.assets).toHaveLength(0);
    expect(empty.accounts).toHaveLength(0);
  });

  it("createGoal trả createdGoalId; replay cùng requestId trả cùng id", () => {
    const a = applyAction(CIF, "replay-create", create("replay"));
    const b = applyAction(CIF, "replay-create", create("replay"));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.createdGoalId).toBeTruthy();
    expect(b.createdGoalId).toBe(a.createdGoalId);
    expect(b.world.goals.length).toBe(a.world.goals.length);
    fx.db.prepare("UPDATE gv2_action_log SET created_goal_id = NULL WHERE cif = ? AND request_id = ?").run(CIF, "replay-create");
    const c = applyAction(CIF, "replay-create", create("replay"));
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.createdGoalId ?? null).toBeNull();
  });

  it("N3 TEXT_success: tên trùng id tạm không bị đổi; map chỉ goalId", async () => {
    const payload = () => getWorld(CIF);
    let first = true;
    const sent: unknown[] = [];
    let resolution: { goalIdMap: Record<string, string>; unsavedGoalIds: string[] } | undefined;
    let finish!: (v: unknown) => void;
    const done = new Promise((r) => {
      finish = r;
    });
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      sent.push(b.action);
      if (first) {
        first = false;
        return new Response(JSON.stringify({ ...payload(), createdGoalId: "goal-server-900" }), { status: 200 });
      }
      return postActions(String(init?.body));
    }) as typeof fetch;

    const q = new ActionQueue(CIF, {
      onWorld: (_p, ids) => {
        resolution = ids;
        finish(null);
      },
      onError: () => {},
      onInfo: () => {},
    });
    q.enqueue(create("first"), "goal-local-900");
    q.enqueue(create("goal-local-900"), "goal-local-901");
    q.enqueue({ type: "setRiskProfile", profile: "balanced" });
    await done;
    expect(sent).toHaveLength(3);
    expect((sent[1] as { input: { name: string } }).input.name).toBe("goal-local-900");
    expect(resolution?.goalIdMap["goal-local-900"]).toBe("goal-server-900");
  });

  it("N3 TEXT_failure: tạo 422 → bỏ thao tác tham chiếu id đó; tên không khiến bỏ create thứ hai", async () => {
    const payload = () => getWorld(CIF);
    let first = true;
    const sent: unknown[] = [];
    let finish!: (v: unknown) => void;
    const done = new Promise((r) => {
      finish = r;
    });
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      sent.push(b.action);
      if (first) {
        first = false;
        return new Response(JSON.stringify({ ...payload(), error: "injected" }), { status: 422 });
      }
      return postActions(String(init?.body));
    }) as typeof fetch;

    const q = new ActionQueue(CIF, {
      onWorld: () => finish(null),
      onError: () => {},
      onInfo: () => {},
    });
    q.enqueue(create("fail-first"), "goal-local-fail");
    q.enqueue(create("goal-local-fail"), "goal-local-fail-2");
    q.enqueue({ type: "setStandingOrder", goalId: "goal-local-fail", amount: 1_000_000, dayOfMonth: 5 });
    q.enqueue({ type: "pauseGoal", goalId: "some-real" });
    await done;
    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(sent.some((a) => (a as { type: string }).type === "setStandingOrder")).toBe(false);
    expect(sent.filter((a) => (a as { type: string }).type === "createGoal")).toHaveLength(2);
  });

  it("N2 REAL_MAP: thao tác xếp sau dùng id server; không nhảy sang mục tiêu khác", async () => {
    let state: PreviewState = {
      ...getWorld(CIF).world,
      nav: { stack: [{ key: "list", screen: "GoalList", params: {} }] },
      toasts: [],
    };
    state = previewReducer(state, create("r3-own"));
    const lid = state.lastCreatedGoalId!;
    applyAction(CIF, "real-race", create("other session"));

    const sent: unknown[] = [];
    let finish!: (v: unknown) => void;
    const done = new Promise((r) => {
      finish = r;
    });
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)).action);
      return postActions(String(init?.body));
    }) as typeof fetch;

    const q = new ActionQueue(CIF, {
      onWorld: (p, ids) => {
        state = previewReducer(state, { type: "world/sync", world: p.world, ...ids });
        finish(null);
      },
      onError: () => {},
      onInfo: () => {},
    });
    q.enqueue(create("r3-own"), lid);
    state = previewReducer(state, {
      type: "nav/push",
      screen: "OpenAccountConfirm",
      params: { goalId: lid },
    });
    q.enqueue({ type: "setStandingOrder", goalId: lid, amount: 1_000_000, dayOfMonth: 5 });
    await done;

    const own = state.goals.find((g) => g.name === "r3-own");
    expect(own).toBeTruthy();
    expect(own!.id).not.toBe(lid);
    expect(state.lastCreatedGoalId).toBe(own!.id);
    expect(state.nav.stack.at(-1)?.params.goalId).toBe(own!.id);
    const open = sent.find((a) => (a as { type: string }).type === "setStandingOrder") as { goalId: string };
    expect(open.goalId).toBe(own!.id);
    expect(open.goalId).not.toBe(lid);
    expect(own!.status).toBe("accumulating");
  });

  it("N2 NEW_RECONCILE: tạo offline hết 3 lần → cắt nav, không chọn mục tiêu cũ", async () => {
    vi.useFakeTimers();
    try {
      let state: PreviewState = {
        ...getWorld(CIF).world,
        nav: { stack: [{ key: "x", screen: "GoalList", params: {} }] },
        toasts: [],
      };
      const existing = state.goals.at(-1);
      const a = create("NEW NEVER SAVED");
      state = previewReducer(state, a);
      const newId = state.lastCreatedGoalId!;
      state = previewReducer(state, {
        type: "nav/push",
        screen: "OpenAccountConfirm",
        params: { goalId: newId },
      });
      let posts = 0;
      const payload = getWorld(CIF);
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts++;
          throw new Error("injected offline");
        }
        return new Response(JSON.stringify(payload));
      }) as typeof fetch;

      const done = new Promise<void>((resolve) => {
        const q = new ActionQueue(CIF, {
          onWorld: (p, ids) => {
            state = previewReducer(state, { type: "world/sync", world: p.world, ...ids });
            resolve();
          },
          onError: () => {},
          onInfo: () => {},
        });
        q.enqueue(a, newId);
      });
      await vi.runAllTimersAsync();
      await done;
      expect(posts).toBe(3);
      expect(state.lastCreatedGoalId).toBeUndefined();
      expect(state.nav.stack.at(-1)?.screen).toBe("GoalList");
      expect(state.goals.some((g) => g.name === "NEW NEVER SAVED")).toBe(false);
      if (existing) {
        expect(state.lastCreatedGoalId).not.toBe(existing.id);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("N3 NAV_CONTROL: unsaved trùng giá trị tab không cắt màn", () => {
    const w = getWorld(CIF).world;
    const s: PreviewState = {
      ...w,
      nav: {
        stack: [
          { key: "a", screen: "GoalList", params: {} },
          { key: "b", screen: "GoalDetail", params: { goalId: w.goals[0]?.id ?? "g", tab: "goal-local-900" } },
        ],
      },
      toasts: [],
    };
    const keep = previewReducer(s, { type: "world/sync", world: w, unsavedGoalIds: ["goal-local-900"] });
    expect(keep.nav.stack).toHaveLength(2);
    expect(keep.nav.stack[1].params.tab).toBe("goal-local-900");
  });
});
