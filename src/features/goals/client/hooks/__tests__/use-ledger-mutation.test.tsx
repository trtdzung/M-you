import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLedgerMutation } from "../use-ledger-mutation";

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

describe("useLedgerMutation", () => {
  it("returns null when cif is null", () => {
    persona.cif = null;
    const { result } = renderHook(() => useLedgerMutation());
    expect(result.current.add("goal_1", { kind: "deposit", amount: 1 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tracks pending, a field error, and a form-level error", async () => {
    let resolveWrite: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve; }));
    const { result } = renderHook(() => useLedgerMutation());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.add("goal_1", { kind: "withdraw", amount: 10, note: "ok" }) ?? Promise.resolve();
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolveWrite(json({ errors: { amount: "Vượt số đã góp" } }, 422));
      await pending;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.errors).toEqual({ amount: "Vượt số đã góp" });

    fetchMock.mockResolvedValue(json({ error: "sập" }, 500));
    await act(async () => {
      await result.current.add("goal_1", { kind: "deposit", amount: 1 });
    });
    expect(result.current.errors).toEqual({ _form: "sập" });
  });
});
