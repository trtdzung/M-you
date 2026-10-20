// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database as Db } from "better-sqlite3";
import { CIF, goalInput, openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { readEngineClock } from "@/lib/security/clock";
import { applyAction, getWorld } from "../goal-service";
import { rewindToNow } from "../rewind";

process.env.AGENT_MODE = "mock";

describe("rewindToNow", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  const balances = () => fx.db.prepare("SELECT id, balance FROM accounts WHERE cif = ? ORDER BY id").all(CIF);
  const txnCount = () => (fx.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ?").get(CIF) as { n: number }).n;

  it("tua 4 tháng rồi rewind: số dư, giao dịch, lịch trích và đồng hồ về như trước khi tua", () => {
    // `data/pfm.sqlite3` may hold rows stamped after the real "now" (made while testing with the clock moved on): the first rewind
    // settles them, so the snapshot below is the state a rewind leaves and the test does not depend on how clean the seed DB is.
    rewindToNow(CIF);
    const created = applyAction(CIF, "rw-create", { type: "createGoal", input: { ...goalInput("rw"), initialDeposit: 50_000 } });
    expect(created.ok).toBe(true);
    const gid = created.ok ? created.createdGoalId! : "";
    expect(applyAction(CIF, "rw-so", { type: "setStandingOrder", goalId: gid, amount: 100, dayOfMonth: 5 }).ok).toBe(true);
    const before = { balances: balances(), txns: txnCount(), offset: readEngineClock(CIF).offsetMs };

    expect(applyAction(CIF, "rw-adv", { type: "advanceTime", days: 120 }).ok).toBe(true);
    expect(txnCount()).toBeGreaterThan(before.txns);
    expect(readEngineClock(CIF).offsetMs).toBeGreaterThan(before.offset);

    const result = rewindToNow(CIF);
    expect(result.removedTransactions).toBeGreaterThan(0);
    expect(readEngineClock(CIF).offsetMs).toBe(0);
    expect(balances()).toEqual(before.balances);
    expect(txnCount()).toBe(before.txns);

    const world = getWorld(CIF).world;
    expect(world.clock.today).toBe(result.today);
    const goal = world.goals.find((g) => g.id === gid)!;
    expect((goal.standingOrder?.lastRunDate ?? "") <= result.today).toBe(true);
    expect(goal.standingOrder!.nextRunDate > result.today).toBe(true);
  });

  it("gọi lại khi không còn gì ở tương lai thì không đổi gì", () => {
    const before = { balances: balances(), txns: txnCount() };
    const result = rewindToNow(CIF);
    expect(result.removedTransactions).toBe(0);
    expect({ balances: balances(), txns: txnCount() }).toEqual(before);
  });
});
