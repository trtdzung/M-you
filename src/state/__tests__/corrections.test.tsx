import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import {
  CorrectionsProvider,
  useCorrections,
  applyCorrections,
  isHidden,
  type Corrections,
} from "../corrections";
import { txn } from "@/domain/engine/__tests__/helpers";
import { mockStoredCorrections } from "@/test-utils/mock-corrections-fetch";

const CIF = "CIF_0001"; // default persona "stable"
const CIF_KEY = `msb-pfm.corrections.${CIF}`;
const LEGACY_KEY = "msb-pfm.corrections";
const wrapper = ({ children }: { children: ReactNode }) => (
  <PersonaProvider>
    <CorrectionsProvider>{children}</CorrectionsProvider>
  </PersonaProvider>
);

beforeEach(() => {
  window.localStorage.clear();
});

async function renderLoaded() {
  const hook = renderHook(() => useCorrections(), { wrapper });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
}

describe("applyCorrections (pure)", () => {
  it("overrides categoryId and flags userEdited", () => {
    const out = applyCorrections([txn({ id: "a", categoryId: "dining" })], { a: { categoryId: "transport" } });
    expect(out[0].categoryId).toBe("transport");
    expect(out[0].userEdited).toBe(true);
  });

  it("ignores a hidden-only correction", () => {
    const out = applyCorrections([txn({ id: "a", categoryId: "dining" })], { a: { hidden: true } });
    expect(out[0].categoryId).toBe("dining");
    expect(out[0].userEdited).toBe(false);
  });
});

describe("isHidden", () => {
  it("is true only when the record's hidden flag is set", () => {
    const c: Corrections = { a: { hidden: true }, b: { categoryId: "x" } };
    expect(isHidden(c, "a")).toBe(true);
    expect(isHidden(c, "b")).toBe(false);
    expect(isHidden(c, "missing")).toBe(false);
  });
});

describe("CorrectionsProvider — server-backed overlay", () => {
  it("migrates pre-DB localStorage labels to the server, then clears the local keys", async () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ t1: "transport" }));
    window.localStorage.setItem(CIF_KEY, JSON.stringify({ t2: { categoryId: "dining", origin: "user" } }));
    const { result } = await renderLoaded();
    expect(result.current.corrections.t1).toEqual({ categoryId: "transport", origin: "user", status: "applied" });
    await waitFor(() => expect(mockStoredCorrections(CIF).t2).toMatchObject({ categoryId: "dining", origin: "user" }));
    expect(mockStoredCorrections(CIF).t1).toMatchObject({ categoryId: "transport" });
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.getItem(CIF_KEY)).toBeNull();
  });

  it("loads the stored overlay; a stored record wins over a stale local one", async () => {
    await act(async () => {
      await fetch("/api/corrections", {
        method: "PATCH",
        body: JSON.stringify({ cif: CIF, changes: { t1: { categoryId: "groceries", origin: "user" } } }),
      });
    });
    window.localStorage.setItem(CIF_KEY, JSON.stringify({ t1: { categoryId: "dining", origin: "user" } }));
    const { result } = await renderLoaded();
    expect(result.current.corrections.t1).toMatchObject({ categoryId: "groceries" });
    expect(mockStoredCorrections(CIF).t1).toMatchObject({ categoryId: "groceries" });
  });

  it("setCategory writes a user origin; setHidden coexists; reset clears both — each persisted", async () => {
    const { result } = await renderLoaded();

    act(() => result.current.setCategory("t1", "dining"));
    expect(result.current.corrections.t1).toEqual({ categoryId: "dining", origin: "user" });
    await waitFor(() => expect(mockStoredCorrections(CIF).t1).toMatchObject({ categoryId: "dining", origin: "user" }));

    act(() => result.current.setHidden("t1", true));
    expect(result.current.corrections.t1).toEqual({ categoryId: "dining", origin: "user", hidden: true });

    act(() => result.current.clearCategory("t1"));
    expect(result.current.corrections.t1).toEqual({ hidden: true });
    await waitFor(() => expect(mockStoredCorrections(CIF).t1).toMatchObject({ hidden: true }));
    expect(mockStoredCorrections(CIF).t1?.categoryId).toBeUndefined();

    act(() => result.current.reset("t1"));
    expect(result.current.corrections.t1).toBeUndefined();
    await waitFor(() => expect(mockStoredCorrections(CIF).t1).toBeUndefined());
  });

  it("setHidden(false) drops the record when no category override remains", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setHidden("t1", true));
    act(() => result.current.setHidden("t1", false));
    expect(result.current.corrections.t1).toBeUndefined();
    await waitFor(() => expect(mockStoredCorrections(CIF).t1).toBeUndefined());
  });

  it("upsertAssignments applies an AI suggestion but never overwrites a user record", async () => {
    const { result } = await renderLoaded();

    act(() => result.current.upsertAssignments([{ txnId: "t1", categoryId: "dining", origin: "ai", status: "pending", confidence: 0.4 }]));
    expect(result.current.corrections.t1).toMatchObject({ categoryId: "dining", origin: "ai", status: "pending" });

    act(() => result.current.promoteToUser("t2", "groceries"));
    // an AI assignment for t2 must NOT clobber the user's confirmed category
    act(() => result.current.upsertAssignments([{ txnId: "t2", categoryId: "dining", origin: "ai", status: "applied" }]));
    expect(result.current.corrections.t2).toMatchObject({ categoryId: "groceries", origin: "user" });
    await waitFor(() => expect(mockStoredCorrections(CIF).t2).toMatchObject({ categoryId: "groceries", origin: "user" }));
  });

  it("flags unsaved when the server rejects a write, and clears it on the next success (Red Team #12)", async () => {
    const { result } = await renderLoaded();
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
      init?.method === "PATCH" ? Promise.resolve(new Response("{}", { status: 500 })) : realFetch(input, init),
    );
    try {
      expect(result.current.unsaved).toBe(false);
      act(() => result.current.setCategory("t1", "dining"));
      await waitFor(() => expect(result.current.unsaved).toBe(true));
    } finally {
      spy.mockRestore();
    }
    act(() => result.current.setCategory("t2", "dining"));
    await waitFor(() => expect(result.current.unsaved).toBe(false));
  });

  it("stays not-loaded when the overlay cannot be read", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    try {
      const { result } = renderHook(() => useCorrections(), { wrapper });
      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(result.current.loaded).toBe(false);
      expect(result.current.corrections).toEqual({});
    } finally {
      spy.mockRestore();
    }
  });
});
