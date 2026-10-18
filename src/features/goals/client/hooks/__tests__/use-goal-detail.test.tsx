import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavingsGoalView } from "../../../model/types";
import { useGoalDetail } from "../use-goal-detail";

const persona = vi.hoisted(() => ({ cif: "CIF_A" as string | null }));
vi.mock("@/providers/context", () => ({
  usePersonaCif: () => persona.cif,
}));

const house: SavingsGoalView = {
  id: "goal_1",
  name: "Mua nhà",
  targetAmount: 600_000_000,
  targetDate: "2029-09-15",
  flexibility: "flexible",
  monthlyContribution: null,
  status: "active",
  pausedUntil: null,
  jarId: null,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  source: "self_reported",
  currentAmount: 0,
  progress: { percent: 0, milestone: 0, state: "on_track", expectedAmount: 0 },
  feasibility: {
    monthsLeft: 36,
    requiredMonthly: 16_666_667,
    surplus: "unknown",
    result: "unknown",
    source: "estimated",
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function spyOnFetch() {
  return vi.spyOn(globalThis, "fetch");
}

let fetchMock: ReturnType<typeof spyOnFetch>;

beforeEach(() => {
  persona.cif = "CIF_A";
  fetchMock = spyOnFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGoalDetail", () => {
  it("loads the goal and its ledger", async () => {
    let resolveLoad: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveLoad = resolve; }));
    const { result } = renderHook(() => useGoalDetail("goal_1"));
    expect(result.current.loading).toBe(true);
    await act(async () => {
      resolveLoad(json({ goal: house, ledger: [] }));
    });
    expect(result.current.data).toEqual({ goal: house, ledger: [] });
    expect(result.current.error).toBeNull();
  });

  it("keeps a 404 status", async () => {
    fetchMock.mockResolvedValue(json({ error: "not found" }, 404));
    const { result } = renderHook(() => useGoalDetail("missing"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.status).toBe(404);
    expect(result.current.error).toBe("not found");
  });

  it("reloads on refresh and ignores a late response after the cif changes", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ goal: house, ledger: [] }))
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolve(json({ goal: { ...house, name: "Xe" }, ledger: [] }));
        }),
      );
    const { result, rerender } = renderHook(() => useGoalDetail("goal_1"));
    await waitFor(() => expect(result.current.data?.goal.name).toBe("Mua nhà"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data?.goal.name).toBe("Xe"));

    let resolveLate: (value: Response) => void = () => {};
    let resolveNext: (value: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLate = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    act(() => result.current.refresh());
    persona.cif = "CIF_B";
    rerender();
    expect(result.current.data).toBeNull();

    await act(async () => {
      resolveLate(json({ goal: { ...house, name: "Muộn" }, ledger: [] }));
    });
    expect(result.current.data).toBeNull();
    await act(async () => {
      resolveNext(json({ goal: { ...house, name: "Đúng cif" }, ledger: [] }));
    });
    expect(result.current.data?.goal.name).toBe("Đúng cif");
  });
});
