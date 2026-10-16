import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Transaction } from "@/domain/models";
import { PersonaProvider, usePersona } from "@/providers/context";
import { ManualTxnsProvider, useManualTxns } from "../manual-txns";

/**
 * In-memory stand-in for `/api/manual-transactions` (the SQLite route can't run
 * in jsdom). Keyed by `cif`, it mirrors the route's create/patch/delete/list
 * semantics — including `null`-means-clear on PATCH — so these tests exercise the
 * real hook against a faithful persistence boundary.
 */
const db = new Map<string, Transaction[]>();

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://localhost");
      const cif = url.searchParams.get("cif") ?? "";
      const method = init?.method ?? "GET";
      const rows = db.get(cif) ?? [];

      if (method === "GET") {
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      if (method === "POST") {
        const { cif: c, txn } = JSON.parse(String(init?.body)) as { cif: string; txn: Transaction };
        const list = (db.get(c) ?? []).filter((t) => t.id !== txn.id);
        db.set(c, [{ ...txn, source: "self_reported" }, ...list]);
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      if (method === "PATCH") {
        const { cif: c, id, patch } = JSON.parse(String(init?.body)) as {
          cif: string;
          id: string;
          patch: Record<string, unknown>;
        };
        const list = db.get(c) ?? [];
        const idx = list.findIndex((t) => t.id === id);
        if (idx === -1) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
        const next = { ...list[idx], userEdited: true } as Record<string, unknown>;
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete next[k];
          else next[k] = v;
        }
        list[idx] = next as unknown as Transaction;
        return new Response(JSON.stringify(next), { status: 200 });
      }
      if (method === "DELETE") {
        const id = url.searchParams.get("id");
        db.set(cif, (db.get(cif) ?? []).filter((t) => t.id !== id));
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 405 });
    }),
  );
}

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
  db.clear();
  window.localStorage.clear();
  installFetchMock();
});

/**
 * The manual-txns store backs both the ＋ entry and the transfer success card,
 * now persisting to the SQLite-backed `/api/manual-transactions` route. These
 * pin: explicit `type` (incl. "transfer"), `add` returning an id, `update`
 * returning a found-boolean (never a silent no-op), DB persistence across a
 * remount, per-persona isolation, and the one-time localStorage→DB migration.
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

  it("persists to the DB across a remount", async () => {
    const first = renderHook(() => useHarness(), { wrapper });
    act(() => {
      first.result.current.add({ amount: 500_000, direction: "debit", categoryId: "dining", merchantName: "keep", postedAt: "2026-09-15T10:00:00.000Z" });
    });
    await waitFor(() => expect(db.get(first.result.current.cif)?.some((t) => t.merchantName === "keep")).toBe(true));
    first.unmount();

    const second = renderHook(() => useHarness(), { wrapper });
    await waitFor(() => expect(second.result.current.manualTxns.some((t) => t.merchantName === "keep")).toBe(true));
  });

  it("isolates records per persona (no cross-persona leak)", async () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.setPersona("stable"));
    const cifA = result.current.cif;
    act(() => {
      result.current.add({ amount: 500_000, direction: "debit", categoryId: "transfer", type: "transfer", merchantName: "Recipient A", postedAt: "2026-09-15T10:00:00.000Z" });
    });
    expect(result.current.manualTxns.some((t) => t.merchantName === "Recipient A")).toBe(true);

    // Switch to a different persona → its store does not show A's record.
    act(() => result.current.setPersona("wealthy"));
    expect(result.current.cif).not.toBe(cifA);
    await waitFor(() => expect(result.current.manualTxns.some((t) => t.merchantName === "Recipient A")).toBe(false));

    // Switch back → persona A's record is still there (loaded from the DB).
    act(() => result.current.setPersona("stable"));
    await waitFor(() => expect(result.current.manualTxns.some((t) => t.merchantName === "Recipient A")).toBe(true));
  });

  it("does not clobber an optimistic add issued while the initial load is in flight (RT#2)", async () => {
    // GET is held open so the load is still in flight when we add().
    let releaseGet: (rows: Transaction[]) => void = () => {};
    const getResult = new Promise<Transaction[]>((r) => {
      releaseGet = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify(await getResult), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }),
    );

    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => {
      result.current.add({ amount: 1, direction: "debit", categoryId: "dining", merchantName: "optimistic", postedAt: "2026-09-15T10:00:00.000Z" });
    });
    expect(result.current.manualTxns.some((t) => t.merchantName === "optimistic")).toBe(true);

    // Load resolves with a DIFFERENT row (snapshot taken before the add).
    const existing = { id: "manual-existing", merchantName: "existing", source: "self_reported", postedAt: "2026-09-01T00:00:00.000Z", amount: 1 } as Transaction;
    await act(async () => {
      releaseGet([existing]);
      await getResult;
    });

    await waitFor(() => {
      expect(result.current.manualTxns.some((t) => t.merchantName === "existing")).toBe(true);
      expect(result.current.manualTxns.some((t) => t.merchantName === "optimistic")).toBe(true); // survived the load
    });
  });

  it("migrates legacy records resumably — no data loss when one import fails then retries (RT#1)", async () => {
    const { result: probe } = renderHook(() => usePersona(), { wrapper: ({ children }) => <PersonaProvider>{children}</PersonaProvider> });
    const cif = probe.current.persona.cif;
    const legacyKey = `msb-pfm.manual-txns.${cif}`;
    const a = { id: "m-a", merchantName: "A", source: "self_reported", postedAt: "2026-09-01T00:00:00.000Z", amount: 1 } as Transaction;
    const b = { id: "m-b", merchantName: "B", source: "self_reported", postedAt: "2026-09-02T00:00:00.000Z", amount: 1 } as Transaction;
    window.localStorage.setItem(legacyKey, JSON.stringify([a, b]));

    // POST for m-b fails exactly once (flaky first import), succeeds afterwards.
    let failB = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input, "http://localhost");
        const c = url.searchParams.get("cif") ?? "";
        const method = init?.method ?? "GET";
        if (method === "GET") return new Response(JSON.stringify(db.get(c) ?? []), { status: 200 });
        if (method === "POST") {
          const { cif: pc, txn } = JSON.parse(String(init?.body)) as { cif: string; txn: Transaction };
          if (txn.id === "m-b" && failB) {
            failB = false;
            return new Response(JSON.stringify({ error: "flaky" }), { status: 500 });
          }
          db.set(pc, [{ ...txn, source: "self_reported" }, ...(db.get(pc) ?? []).filter((t) => t.id !== txn.id)]);
          return new Response(JSON.stringify({ ok: true }), { status: 201 });
        }
        return new Response(null, { status: 405 });
      }),
    );

    // First mount: m-b's import throws → localStorage must NOT be cleared.
    const first = renderHook(() => useHarness(), { wrapper });
    await waitFor(() => expect(db.get(cif)?.some((t) => t.id === "m-a")).toBe(true));
    expect(window.localStorage.getItem(legacyKey)).not.toBeNull(); // retained for retry
    first.unmount();

    // Second mount: only m-b is missing → re-imported, then the key is cleared.
    const second = renderHook(() => useHarness(), { wrapper });
    await waitFor(() => {
      expect(second.result.current.manualTxns.some((t) => t.id === "m-a")).toBe(true);
      expect(second.result.current.manualTxns.some((t) => t.id === "m-b")).toBe(true);
    });
    expect(db.get(cif)?.map((t) => t.id).sort()).toEqual(["m-a", "m-b"]);
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
  });

  it("imports legacy localStorage records into the DB once, then clears the key", async () => {
    const { result: probe } = renderHook(() => usePersona(), { wrapper: ({ children }) => <PersonaProvider>{children}</PersonaProvider> });
    const cif = probe.current.persona.cif;
    const legacyKey = `msb-pfm.manual-txns.${cif}`;
    const legacyTxn = { id: "manual-legacy-1", merchantName: "legacy", source: "self_reported", postedAt: "2026-09-10T00:00:00.000Z", amount: 1 } as Transaction;
    window.localStorage.setItem(legacyKey, JSON.stringify([legacyTxn]));

    const { result } = renderHook(() => useHarness(), { wrapper });
    await waitFor(() => expect(result.current.manualTxns.some((t) => t.id === "manual-legacy-1")).toBe(true));
    // Imported into the DB and the legacy key removed.
    expect(db.get(cif)?.some((t) => t.id === "manual-legacy-1")).toBe(true);
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
  });
});
