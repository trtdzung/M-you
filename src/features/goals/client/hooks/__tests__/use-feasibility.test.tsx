import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeasibilityResponse } from "../../../model/types";
import { useFeasibility } from "../use-feasibility";

const persona = vi.hoisted(() => ({ cif: "CIF_A" as string | null }));
vi.mock("@/providers/context", () => ({
  usePersonaCif: () => persona.cif,
}));

const ready = {
  surplus: 12_000_000,
  feasibility: {
    monthsLeft: 36,
    requiredMonthly: 16_666_667,
    surplus: 12_000_000,
    result: "infeasible" as const,
    source: "self_reported" as const,
  },
  levers: [],
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
  vi.useFakeTimers();
  fetchMock = spyOnFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFeasibility", () => {
  it("does not call the API until both targetAmount and targetDate are set", async () => {
    type Input = { targetAmount?: number | null; targetDate?: string };
    const { rerender } = renderHook((props: Input) => useFeasibility(props), {
      initialProps: { targetAmount: null, targetDate: "2029-09-15" } as Input,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    rerender({ targetAmount: 0, targetDate: "2029-09-15" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    rerender({ targetAmount: 600_000_000, targetDate: undefined });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    persona.cif = null;
    rerender({ targetAmount: 600_000_000, targetDate: "2029-09-15" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debounces keystrokes into a single request", async () => {
    fetchMock.mockResolvedValue(json(ready));
    const { result, rerender } = renderHook(
      (props: { targetAmount: number }) =>
        useFeasibility({ targetAmount: props.targetAmount, targetDate: "2029-09-15" }),
      { initialProps: { targetAmount: 100 } },
    );
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ targetAmount: 200 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ targetAmount: 300 });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body)).targetAmount).toBe(300);
    expect(result.current.data).toEqual(ready);
    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it("ignores the response of an older input", async () => {
    let resolveOld: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(
      (props: { targetAmount: number }) =>
        useFeasibility({ targetAmount: props.targetAmount, targetDate: "2029-09-15" }),
      { initialProps: { targetAmount: 100 } },
    );
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    const newer: FeasibilityResponse = { ...ready, surplus: 1 };
    let resolveNew: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
    rerender({ targetAmount: 200 });
    expect(result.current.data).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await act(async () => {
      resolveOld(json({ ...ready, surplus: 999 }));
    });
    expect(result.current.data).toBeNull();

    await act(async () => {
      resolveNew(json(newer));
    });
    expect(result.current.data).toEqual(newer);
  });

  it("marks the check failed when the response is not ok", async () => {
    fetchMock.mockResolvedValue(json({ error: "sai" }, 422));
    const { result } = renderHook(() =>
      useFeasibility({ targetAmount: 600_000_000, targetDate: "2029-09-15" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.failed).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
