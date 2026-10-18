// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => null }));

import * as collection from "../route";
import * as item from "../[id]/route";
import * as ledger from "../[id]/ledger/route";
import * as feasibility from "../feasibility/route";
import { POST as addLedger } from "@/features/goals/api/add-ledger-entry";
import { POST as checkFeasibility } from "@/features/goals/api/check-feasibility";
import { POST as createGoal } from "@/features/goals/api/create-goal";
import { DELETE as deleteGoal } from "@/features/goals/api/delete-goal";
import { GET as getGoal } from "@/features/goals/api/get-goal";
import { GET as listGoals } from "@/features/goals/api/list-goals";
import { PUT as updateGoal } from "@/features/goals/api/update-goal";

describe("goal route re-exports", () => {
  it("re-exports the collection GET and POST handlers", () => {
    expect(collection.GET).toBe(listGoals);
    expect(collection.POST).toBe(createGoal);
  });

  it("re-exports GET, PUT and DELETE for one goal", () => {
    expect(item.GET).toBe(getGoal);
    expect(item.PUT).toBe(updateGoal);
    expect(item.DELETE).toBe(deleteGoal);
  });

  it("re-exports the ledger and feasibility POST handlers", () => {
    expect(ledger.POST).toBe(addLedger);
    expect(feasibility.POST).toBe(checkFeasibility);
  });
});
