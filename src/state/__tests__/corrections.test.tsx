import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  CorrectionsProvider,
  useCorrections,
  applyCorrections,
  isHidden,
  type Corrections,
} from "../corrections";
import { txn } from "@/domain/engine/__tests__/helpers";

const STORAGE_KEY = "msb-pfm.corrections";
const wrapper = ({ children }: { children: ReactNode }) => <CorrectionsProvider>{children}</CorrectionsProvider>;

beforeEach(() => {
  window.localStorage.clear();
});

describe("applyCorrections (pure)", () => {
  it("overrides categoryId and flags userEdited", () => {
    const txns = [txn({ id: "a", categoryId: "dining" })];
    const out = applyCorrections(txns, { a: { categoryId: "transport" } });
    expect(out[0].categoryId).toBe("transport");
    expect(out[0].userEdited).toBe(true);
  });

  it("ignores a hidden-only correction (category unchanged, no exclusion here)", () => {
    const txns = [txn({ id: "a", categoryId: "dining" })];
    const out = applyCorrections(txns, { a: { hidden: true } });
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

describe("CorrectionsProvider — legacy migration + patches", () => {
  it("migrates the legacy flat string map to the object shape", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ t1: "transport" }));
    const { result } = renderHook(() => useCorrections(), { wrapper });
    expect(result.current.corrections.t1).toEqual({ categoryId: "transport" });
  });

  it("setHidden + setCategory coexist on one txn, and reset clears both", () => {
    const { result } = renderHook(() => useCorrections(), { wrapper });

    act(() => result.current.setCategory("t1", "dining"));
    act(() => result.current.setHidden("t1", true));
    expect(result.current.corrections.t1).toEqual({ categoryId: "dining", hidden: true });

    act(() => result.current.clearCategory("t1"));
    expect(result.current.corrections.t1).toEqual({ hidden: true });

    act(() => result.current.reset("t1"));
    expect(result.current.corrections.t1).toBeUndefined();
  });

  it("setHidden(false) drops the record entirely when no category override remains", () => {
    const { result } = renderHook(() => useCorrections(), { wrapper });
    act(() => result.current.setHidden("t1", true));
    act(() => result.current.setHidden("t1", false));
    expect(result.current.corrections.t1).toBeUndefined();
  });
});
