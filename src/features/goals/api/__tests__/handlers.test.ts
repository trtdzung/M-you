// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));
vi.mock("@/lib/demo-clock", () => ({
  transferNow: () => new Date("2026-09-15T00:00:00.000Z"),
}));
vi.mock("@/app/api/jars/jar-write-guards", () => ({ liveTxns: () => [] }));

import { POST as addLedger } from "../add-ledger-entry";
import { POST as checkFeasibility } from "../check-feasibility";
import { POST as createGoal } from "../create-goal";
import { DELETE as deleteGoal } from "../delete-goal";
import { GET as getGoal } from "../get-goal";
import { GET as listGoals } from "../list-goals";
import { PUT as updateGoal } from "../update-goal";
import { ensureGoalTables } from "../../server/db";

const CIF = "CIF_0001";

function request(url: string, method = "GET", body?: unknown, raw?: string): NextRequest {
  const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
  return new NextRequest(url, {
    method,
    headers: payload === undefined ? undefined : { "content-type": "application/json" },
    body: payload,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function counts(): { goals: number; ledger: number } {
  const db = holder.db!;
  const goals = (db.prepare("SELECT COUNT(*) AS n FROM user_goals").get() as { n: number }).n;
  const ledger = (db.prepare("SELECT COUNT(*) AS n FROM user_goal_ledger").get() as { n: number }).n;
  return { goals, ledger };
}

const createBody = {
  cif: CIF,
  name: "Mua nhà",
  targetAmount: 600_000_000,
  targetDate: "2029-09-15",
  flexibility: "flexible" as const,
  openingAmount: 1_000_000,
};

beforeEach(() => {
  holder.db = new Database(":memory:");
  ensureGoalTables(holder.db);
});

describe("goals HTTP handlers", () => {
  it("rejects a missing cif and a broken JSON body with 422", async () => {
    expect(await (await listGoals(request("http://localhost/api/goals"))).json()).toEqual({
      error: "cif is required",
    });
    expect((await listGoals(request("http://localhost/api/goals?cif="))).status).toBe(422);

    const broken = await createGoal(request("http://localhost/api/goals", "POST", undefined, "{"));
    expect(broken.status).toBe(422);
    expect(await broken.json()).toEqual({ error: "cif is required" });

    const brokenPut = await updateGoal(request("http://localhost/api/goals/x", "PUT", undefined, "[]"), ctx("x"));
    expect(brokenPut.status).toBe(422);

    expect((await deleteGoal(request("http://localhost/api/goals/x"), ctx("x"))).status).toBe(422);
    expect((await getGoal(request("http://localhost/api/goals/x"), ctx("x"))).status).toBe(422);
    const brokenLedger = await addLedger(
      request("http://localhost/api/goals/x/ledger", "POST", undefined, "not-json"),
      ctx("x"),
    );
    expect(brokenLedger.status).toBe(422);
    const brokenFeasibility = await checkFeasibility(
      request("http://localhost/api/goals/feasibility", "POST", undefined, "{"),
    );
    expect(brokenFeasibility.status).toBe(422);
    expect(await brokenFeasibility.json()).toEqual({ error: "cif is required" });
  });

  it("returns 422 with field errors for invalid goal, update, and ledger input", async () => {
    const created = await createGoal(
      request("http://localhost/api/goals", "POST", { cif: CIF, name: "", targetAmount: 0 }),
    );
    expect(created.status).toBe(422);
    expect(await created.json()).toEqual({
      errors: expect.objectContaining({
        name: "Tên mục tiêu từ 1 đến 80 ký tự",
        targetAmount: "Số tiền mục tiêu phải là số nguyên dương hợp lệ",
      }),
    });

    const goal = await (
      await createGoal(request("http://localhost/api/goals", "POST", createBody))
    ).json();
    const id = goal.goal.id as string;

    const updated = await updateGoal(
      request(`http://localhost/api/goals/${id}`, "PUT", { cif: CIF, status: "done" }),
      ctx(id),
    );
    expect(updated.status).toBe(422);
    expect(await updated.json()).toEqual({ errors: { status: "Trạng thái không hợp lệ" } });

    const withdrawn = await addLedger(
      request(`http://localhost/api/goals/${id}/ledger`, "POST", { cif: CIF, kind: "withdraw", amount: 100 }),
      ctx(id),
    );
    expect(withdrawn.status).toBe(422);
    expect(await withdrawn.json()).toEqual({
      errors: expect.objectContaining({ note: "Cần nhập câu cam kết khi rút" }),
    });
  });

  it("creates a goal with currentAmount, progress and feasibility, then reads, updates and deletes it", async () => {
    const created = await createGoal(request("http://localhost/api/goals", "POST", createBody));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const id = createdBody.goal.id as string;
    expect(createdBody.goal).toMatchObject({
      name: "Mua nhà",
      currentAmount: 1_000_000,
      progress: { percent: 0.2, milestone: 0, state: "ahead", expectedAmount: 0 },
      feasibility: {
        monthsLeft: 36,
        requiredMonthly: 16_638_889,
        surplus: "unknown",
        result: "unknown",
        source: "estimated",
      },
    });

    const listed = await listGoals(request(`http://localhost/api/goals?cif=${CIF}`));
    expect(listed.status).toBe(200);
    expect((await listed.json()).goals).toHaveLength(1);

    const detail = await getGoal(request(`http://localhost/api/goals/${id}?cif=${CIF}`), ctx(id));
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.goal.id).toBe(id);
    expect(detailBody.ledger).toHaveLength(1);
    expect(detailBody.ledger[0]).toMatchObject({ kind: "deposit", amount: 1_000_000 });

    const missing = await getGoal(request(`http://localhost/api/goals/missing?cif=${CIF}`), ctx("missing"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not found" });

    const updated = await updateGoal(
      request(`http://localhost/api/goals/${id}`, "PUT", { cif: CIF, status: "paused" }),
      ctx(id),
    );
    expect(updated.status).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.goal.status).toBe("paused");
    expect(updatedBody.goal.name).toBe("Mua nhà");

    const missingUpdate = await updateGoal(
      request("http://localhost/api/goals/missing", "PUT", { cif: CIF, status: "archived" }),
      ctx("missing"),
    );
    expect(missingUpdate.status).toBe(404);

    const removed = await deleteGoal(request(`http://localhost/api/goals/${id}?cif=${CIF}`), ctx(id));
    expect(removed.status).toBe(204);
    expect(await getGoal(request(`http://localhost/api/goals/${id}?cif=${CIF}`), ctx(id))).toMatchObject({
      status: 404,
    });
    expect((await deleteGoal(request(`http://localhost/api/goals/${id}?cif=${CIF}`), ctx(id))).status).toBe(404);
  });

  it("posts a deposit, rejects a withdrawal over the balance, and 404s an unknown goal", async () => {
    const created = await createGoal(
      request("http://localhost/api/goals", "POST", { ...createBody, openingAmount: null }),
    );
    const id = (await created.json()).goal.id as string;

    const deposit = await addLedger(
      request(`http://localhost/api/goals/${id}/ledger`, "POST", {
        cif: CIF,
        kind: "deposit",
        amount: 5_000,
      }),
      ctx(id),
    );
    expect(deposit.status).toBe(201);
    const depositBody = await deposit.json();
    expect(depositBody.entry).toMatchObject({ kind: "deposit", amount: 5_000 });
    expect(depositBody.goal.currentAmount).toBe(5_000);

    const over = await addLedger(
      request(`http://localhost/api/goals/${id}/ledger`, "POST", {
        cif: CIF,
        kind: "withdraw",
        amount: 5_001,
        note: "Tôi chấp nhận",
      }),
      ctx(id),
    );
    expect(over.status).toBe(422);
    expect(await over.json()).toEqual({ errors: { amount: "Vượt số đã góp" } });
    const still = await getGoal(request(`http://localhost/api/goals/${id}?cif=${CIF}`), ctx(id));
    expect((await still.json()).goal.currentAmount).toBe(5_000);

    const unknown = await addLedger(
      request("http://localhost/api/goals/missing/ledger", "POST", {
        cif: CIF,
        kind: "deposit",
        amount: 1,
      }),
      ctx("missing"),
    );
    expect(unknown.status).toBe(404);
  });

  it("checks feasibility without writing, using a self-reported surplus and levers when infeasible", async () => {
    const before = counts();
    const bad = await checkFeasibility(
      request("http://localhost/api/goals/feasibility", "POST", {
        cif: CIF,
        targetAmount: 0,
        targetDate: "2029-09-15",
      }),
    );
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({
      errors: expect.objectContaining({
        targetAmount: "Số tiền mục tiêu phải là số nguyên dương hợp lệ",
      }),
    });
    expect(counts()).toEqual(before);

    const ok = await checkFeasibility(
      request("http://localhost/api/goals/feasibility", "POST", {
        cif: CIF,
        targetAmount: 600_000_000,
        targetDate: "2029-09-15",
        currentAmount: 0,
        flexibility: "flexible",
        estimatedMonthlySurplus: 12_000_000,
      }),
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.surplus).toBe(12_000_000);
    expect(body.feasibility).toMatchObject({
      result: "infeasible",
      source: "self_reported",
      requiredMonthly: 16_666_667,
      monthsLeft: 36,
      surplus: 12_000_000,
    });
    expect(body.levers.map((lever: { kind: string }) => lever.kind)).toEqual([
      "extend_date",
      "reduce_amount",
    ]);
    expect(counts()).toEqual(before);

    const estimated = await checkFeasibility(
      request("http://localhost/api/goals/feasibility", "POST", {
        cif: CIF,
        targetAmount: 600_000_000,
        targetDate: "2029-09-15",
      }),
    );
    const estimatedBody = await estimated.json();
    expect(estimatedBody.surplus).toBe("unknown");
    expect(estimatedBody.feasibility.source).toBe("estimated");
    expect(estimatedBody.levers).toEqual([]);
    expect(counts()).toEqual(before);
  });
});
