import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavingsGoalView } from "../../../model/types";
import { useGoalsList } from "../use-goals-list";

const persona = vi.hoisted(() => ({ cif: "CIF_A" as string | null }));
vi.mock("@/providers/context", () => ({
  usePersonaCif: () => persona.cif,
}));

function view(id: string, name: string): SavingsGoalView {
  return {
    id,
    name,
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
}

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

describe("useGoalsList", () => {
  it("goes from loading to the goal list", async () => {
    let resolveLoad: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveLoad = resolve; }));
    const house = view("goal_1", "Mua nhà");
    const { result } = renderHook(() => useGoalsList());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await act(async () => {
      resolveLoad(json({ goals: [house] }));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([house]);
    expect(result.current.error).toBeNull();
  });

  it("exposes a failed load", async () => {
    fetchMock.mockResolvedValue(json({ error: "hỏng" }, 500));
    const { result } = renderHook(() => useGoalsList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("hỏng");
    expect(result.current.status).toBe(500);
  });

  it("reloads when refresh is called", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ goals: [view("a", "Cũ")] }))
      .mockResolvedValueOnce(json({ goals: [view("b", "Mới")] }));
    const { result } = renderHook(() => useGoalsList());
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe("a"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe("b"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the previous persona's data immediately and ignores a late response", async () => {
    let resolveA: (value: Response) => void = () => {};
    let resolveB: (value: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));

    const { result, rerender } = renderHook(() => useGoalsList());
    expect(result.current.loading).toBe(true);

    persona.cif = "CIF_B";
    rerender();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveA(json({ goals: [view("old", "Cũ")] }));
    });
    expect(result.current.data).toBeNull();

    await act(async () => {
      resolveB(json({ goals: [view("new", "Mới")] }));
    });
    expect(result.current.data?.map((goal) => goal.id)).toEqual(["new"]);
  });

  it("stays idle when there is no cif", () => {
    persona.cif = null;
    const { result } = renderHook(() => useGoalsList());
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
