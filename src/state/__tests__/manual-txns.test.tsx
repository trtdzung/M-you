import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider, usePersona } from "@/providers/context";
import { ManualTxnsProvider, useManualTxns } from "../manual-txns";

const wrapper = ({ children }: { children: ReactNode }) => (
  <PersonaProvider>
    <ManualTxnsProvider>{children}</ManualTxnsProvider>
  </PersonaProvider>
);

/** Combined hook so tests can drive persona switching and the txn store together. */
function useHarness() {
  const store = useManualTxns();
  const { persona, setPersona } = usePersona();
  return { ...store, cif: persona.cif, setPersona };
}

beforeEach(() => {
  window.localStorage.clear();
});

/**
 * The manual-txns store backs both the ＋ entry and the transfer success card.
 * These pin: explicit `type` (incl. "transfer"), `add` returning an id, `update`
 * returning a found-boolean (never a silent no-op), persistence, and per-persona
 * isolation (a transfer record's recipient name must not leak across personas).
 */
describe("useManualTxns", () => {
  it("adds a transfer-typed self-reported record and returns its id", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.add({
        amount: 500_000,
        direction: "debit",
        categoryId: "transfer",
        type: "transfer",
        merchantName: "Nguyen Van A",
        postedAt: "2026-09-15T10:00:00.000Z",
      });
    });
    expect(id).toMatch(/^manual-/);
    const rec = result.current.manualTxns.find((t) => t.id === id);
    expect(rec?.type).toBe("transfer");
    expect(rec?.source).toBe("self_reported");
  });

  it("defaults type from direction when not given", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => {
      result.current.add({ amount: 1, direction: "debit", categoryId: "dining", merchantName: "x", postedAt: "2026-09-15T10:00:00.000Z" });
    });
    expect(result.current.manualTxns[0].type).toBe("expense");
  });

  it("update returns true and patches category/type for an existing record", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.add({ amount: 500_000, direction: "debit", categoryId: "transfer", type: "transfer", merchantName: "x", postedAt: "2026-09-15T10:00:00.000Z" });
    });
    let ok = false;
    act(() => {
      ok = result.current.update(id, { categoryId: "dining", type: "expense" });
    });
    expect(ok).toBe(true);
    const rec = result.current.manualTxns.find((t) => t.id === id);
    expect(rec).toMatchObject({ categoryId: "dining", type: "expense" });
  });

  it("update returns false and is a no-op for an unknown id (never throws)", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    let ok = true;
    act(() => {
      ok = result.current.update("manual-does-not-exist", { categoryId: "dining" });
    });
    expect(ok).toBe(false);
    expect(result.current.manualTxns).toHaveLength(0);
  });

  it("persists across a remount", () => {
    const first = renderHook(() => useHarness(), { wrapper });
    act(() => {
      first.result.current.add({ amount: 500_000, direction: "debit", categoryId: "dining", merchantName: "keep", postedAt: "2026-09-15T10:00:00.000Z" });
    });
    first.unmount();
    const second = renderHook(() => useHarness(), { wrapper });
    expect(second.result.current.manualTxns.some((t) => t.merchantName === "keep")).toBe(true);
  });

  it("isolates records per persona (no cross-persona leak)", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    // Pin persona A explicitly (don't depend on the default).
    act(() => result.current.setPersona("stable"));
    const cifA = result.current.cif;
    act(() => {
      result.current.add({ amount: 500_000, direction: "debit", categoryId: "transfer", type: "transfer", merchantName: "Recipient A", postedAt: "2026-09-15T10:00:00.000Z" });
    });
    expect(result.current.manualTxns.some((t) => t.merchantName === "Recipient A")).toBe(true);

    // Switch to a different persona → its store does not show A's record.
    act(() => result.current.setPersona("wealthy"));
    expect(result.current.cif).not.toBe(cifA);
    expect(result.current.manualTxns.some((t) => t.merchantName === "Recipient A")).toBe(false);

    // Switch back → persona A's record is still there.
    act(() => result.current.setPersona("stable"));
    expect(result.current.manualTxns.some((t) => t.merchantName === "Recipient A")).toBe(true);
  });
});
