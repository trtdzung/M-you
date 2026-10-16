import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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

const CIF_KEY = "msb-pfm.corrections.CIF_0001"; // default persona "stable"
const LEGACY_KEY = "msb-pfm.corrections";
const wrapper = ({ children }: { children: ReactNode }) => (
  <PersonaProvider>
    <CorrectionsProvider>{children}</CorrectionsProvider>
  </PersonaProvider>
);

beforeEach(() => {
  window.localStorage.clear();
});

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

describe("CorrectionsProvider — migration, patches, assignments", () => {
  it("migrates the legacy flat key into the persona, defaulting origin/status", () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ t1: "transport" }));
    const { result } = renderHook(() => useCorrections(), { wrapper });
    expect(result.current.corrections.t1).toEqual({ categoryId: "transport", origin: "user", status: "applied" });
    // legacy key is removed after migration
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    // persisted under the per-cif key
    expect(window.localStorage.getItem(CIF_KEY)).not.toBeNull();
  });

  it("setCategory writes a user origin; setHidden coexists; reset clears both", () => {
    const { result } = renderHook(() => useCorrections(), { wrapper });

    act(() => result.current.setCategory("t1", "dining"));
    expect(result.current.corrections.t1).toEqual({ categoryId: "dining", origin: "user" });

    act(() => result.current.setHidden("t1", true));
    expect(result.current.corrections.t1).toEqual({ categoryId: "dining", origin: "user", hidden: true });

    act(() => result.current.clearCategory("t1"));
    expect(result.current.corrections.t1).toEqual({ hidden: true });

    act(() => result.current.reset("t1"));
    expect(result.current.corrections.t1).toBeUndefined();
  });

  it("setHidden(false) drops the record when no category override remains", () => {
    const { result } = renderHook(() => useCorrections(), { wrapper });
    act(() => result.current.setHidden("t1", true));
    act(() => result.current.setHidden("t1", false));
    expect(result.current.corrections.t1).toBeUndefined();
  });

  it("upsertAssignments applies an AI suggestion but never overwrites a user record", () => {
    const { result } = renderHook(() => useCorrections(), { wrapper });

    act(() => result.current.upsertAssignments([{ txnId: "t1", categoryId: "dining", origin: "ai", status: "pending", confidence: 0.4 }]));
    expect(result.current.corrections.t1).toMatchObject({ categoryId: "dining", origin: "ai", status: "pending" });

    act(() => result.current.promoteToUser("t2", "groceries"));
    // an AI assignment for t2 must NOT clobber the user's confirmed category
    act(() => result.current.upsertAssignments([{ txnId: "t2", categoryId: "dining", origin: "ai", status: "applied" }]));
    expect(result.current.corrections.t2).toMatchObject({ categoryId: "groceries", origin: "user" });
  });

  it("flags unsaved when a localStorage write throws (Red Team #12)", () => {
    const { result } = renderHook(() => useCorrections(), { wrapper });
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      expect(result.current.unsaved).toBe(false);
      act(() => result.current.setCategory("t1", "dining"));
      expect(result.current.unsaved).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("rehydrates from a same-key storage event written by another tab (Red Team #11)", () => {
    const { result } = renderHook(() => useCorrections(), { wrapper });
    const fromOtherTab: Corrections = { t9: { categoryId: "transport", origin: "user", status: "applied" } };
    // The other tab has already written the fresh value BEFORE we hear about it.
    window.localStorage.setItem(CIF_KEY, JSON.stringify(fromOtherTab));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: CIF_KEY }));
    });
    expect(result.current.corrections.t9).toEqual({ categoryId: "transport", origin: "user", status: "applied" });
  });
});
