// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { GoalLedgerEntry, SavingsGoal } from "../../model/types";
import type { GoalCashflowInput } from "../cashflow-input";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { insertGoal } from "../goals-repo";
import { appendLedger } from "../ledger-repo";
import { loadGoalView, toGoalView } from "../goal-view";

const NOW = new Date("2026-09-15T00:00:00.000Z");
const LATER = new Date("2026-10-15T00:00:00.000Z");

const cashflow: GoalCashflowInput = {
  months: [
    { monthKey: "2026-06", income: 20_000_000, expense: 8_000_000, txnCount: 2 },
    { monthKey: "2026-07", income: 0, expense: 0, txnCount: 0 },
    { monthKey: "2026-08", income: 10_000_000, expense: 6_000_000, txnCount: 1 },
  ],
  categoryAverages: [],
};

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal_1",
    name: "Mua nhà",
    targetAmount: 600_000_000,
    targetDate: "2029-09-15",
    flexibility: "flexible",
    monthlyContribution: null,
    status: "active",
    pausedUntil: null,
    jarId: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    source: "self_reported",
    ...overrides,
  };
}

function entry(overrides: Partial<GoalLedgerEntry> & Pick<GoalLedgerEntry, "kind" | "amount">): GoalLedgerEntry {
  return {
    id: "gled_1",
    goalId: "goal_1",
    note: null,
    createdAt: NOW.toISOString(),
    source: "self_reported",
    ...overrides,
  };
}

beforeEach(() => {
  holder.db = new Database(":memory:");
});

describe("toGoalView", () => {
  it("joins currentAmount, progress and feasibility from the ledger and cashflow", () => {
    const view = toGoalView(
      goal(),
      [
        entry({ id: "d", kind: "deposit", amount: 60_000_000 }),
        entry({ id: "w", kind: "withdraw", amount: 10_000_000, note: "ok" }),
      ],
      NOW,
      cashflow,
    );
    // current = 60tr − 10tr. surplus = round((12tr + 4tr) / 2) = 8tr.
    // required = ceil((600tr − 50tr) / 36) = 15_277_778. expected = 0 vì vừa tạo.
    expect(view.currentAmount).toBe(50_000_000);
    expect(view.feasibility).toEqual({
      monthsLeft: 36,
      requiredMonthly: 15_277_778,
      surplus: 8_000_000,
      result: "infeasible",
      source: "estimated",
    });
    expect(view.progress).toEqual({
      percent: 8.3,
      milestone: 0,
      state: "ahead",
      expectedAmount: 0,
    });
    expect(view.name).toBe("Mua nhà");
  });
});

describe("loadGoalView", () => {
  it("reads the goal ledger from the database", () => {
    const saved = insertGoal(
      "A",
      {
        name: "Mua nhà",
        targetAmount: 600_000_000,
        targetDate: "2029-09-15",
        flexibility: "flexible",
        monthlyContribution: null,
        openingAmount: null,
      },
      NOW,
    );
    appendLedger("A", saved.id, { kind: "deposit", amount: 60_000_000, note: null }, NOW);
    appendLedger("A", saved.id, { kind: "withdraw", amount: 10_000_000, note: "ok" }, LATER);
    const view = loadGoalView("A", saved, NOW, cashflow);
    expect(view.currentAmount).toBe(50_000_000);
    expect(view.progress.percent).toBe(8.3);
    expect(view.feasibility.requiredMonthly).toBe(15_277_778);
    expect(loadGoalView("B", saved, NOW, cashflow).currentAmount).toBe(0);
  });
});
