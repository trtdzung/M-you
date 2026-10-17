import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoalMutations } from "../use-goal-mutations";

const persona = vi.hoisted(() => ({ cif: "CIF_A" as string | null }));
vi.mock("@/providers/context", () => ({
  usePersonaCif: () => persona.cif,
}));

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

describe("useGoalMutations", () => {
  it("returns null for every write when cif is null", () => {
    persona.cif = null;
    const { result } = renderHook(() => useGoalMutations());
    expect(result.current.create({ name: "Mua nhà" })).toBeNull();
    expect(result.current.update("goal_1", { status: "paused" })).toBeNull();
    expect(result.current.remove("goal_1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tracks pending and field errors", async () => {
    let resolveWrite: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveWrite = resolve; }));
    const { result } = renderHook(() => useGoalMutations());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.create({ name: "Mua nhà" }) ?? Promise.resolve();
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.errors).toBeNull();

    await act(async () => {
      resolveWrite(json({ errors: { name: "sai" } }, 422));
      await pending;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.errors).toEqual({ name: "sai" });
  });

  it("puts an error that is not tied to a field on _form and reset clears it", async () => {
    fetchMock.mockResolvedValue(json({ error: "sập" }, 500));
    const { result } = renderHook(() => useGoalMutations());
    await act(async () => {
      await result.current.update("goal_1", { status: "paused" });
    });
    expect(result.current.errors).toEqual({ _form: "sập" });

    fetchMock.mockResolvedValue(new Response("nope", { status: 502 }));
    await act(async () => {
      await result.current.remove("goal_1");
    });
    expect(result.current.errors).toEqual({ _form: "" });

    act(() => result.current.reset());
    expect(result.current.errors).toBeNull();
  });
});
