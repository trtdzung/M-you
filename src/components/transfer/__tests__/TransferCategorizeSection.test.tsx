import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

/**
 * `TransferCategorizeSection` — the transfer-purpose suggestion + accept flow
 * (invariant #6-safe): a heuristic/AI suggestion is ALWAYS pending and must
 * NEVER by itself mutate the record; only the user tapping a choice does
 * ("Đồng ý" on the banner or a manual pick in the sheet). Accepting a
 * `spending` purpose flips the txn transfer→expense (the category change alone
 * re-routes spend to the owning jar — derived model, no separate bookkeeping);
 * a non-spending purpose stays `type:"transfer"` and only records
 * `transferPurpose` metadata (no number moves).
 *
 * Mirrors the mocking pattern in `TransferConfirm.test.tsx`: `@/state/jars`
 * and `@/state/manual-txns` are mocked with an in-memory store so the test
 * is deterministic and never touches the real `/api/jars` network boundary.
 * `useTransferPurposeSuggestion` and its `localPurposeClassify` heuristic run
 * for REAL (no "ai" consent granted ⇒ no network, per `src/lib/consent.ts`
 * defaulting to no scopes) — this is the actual production classify path,
 * not a stub of the hook under test.
 */

interface MockTxn {
  id: string;
  categoryId: string;
  type: string;
  transferPurpose?: string;
  merchantName: string;
  note?: string;
}

type MockDonor = { jarId: string; label: string; take: number };
// Loose shape of what `useAutoFund().reconcile` returns, widened across every
// status this suite drives (default "covered", plus the H1 latch test's
// "needs-goal" → "funded" sequence) so `mockImplementationOnce` type-checks.
type MockReconcileResult = {
  status: "covered" | "needs-goal" | "funded" | "insufficient";
  donors: MockDonor[];
  goalDonors?: MockDonor[];
  targetLabel: string;
};

const h = vi.hoisted(() => {
  const state = {
    store: [] as MockTxn[],
    jarConfig: {
      version: 3,
      jars: [{ id: "essentials", categoryIds: ["housing"] }],
    },
    // Subscribers, so a successful `update` re-renders consumers like the real
    // manual-txns context does (its setState triggers a re-render). Without this
    // the mock is inert and a banner-accept — which changes no local component
    // state — would never refresh the displayed category label.
    listeners: new Set<() => void>(),
    notify() {
      state.listeners.forEach((fn) => fn());
    },
    update: vi.fn((id: string, patch: Partial<MockTxn>) => {
      if (!state.store.some((t) => t.id === id)) return false;
      state.store = state.store.map((t) => (t.id === id ? { ...t, ...patch } : t));
      state.notify();
      return true;
    }),
    // Overridable per-test (default mirrors the original static "covered" stub).
    // RT-fix H1 test reconfigures this to a vi.fn that can re-enter synchronously.
    reconcile: vi.fn((): MockReconcileResult => ({ status: "covered", donors: [], targetLabel: "hũ" })),
  };
  return state;
});

vi.mock("@/providers/context", () => ({
  usePersona: () => ({ persona: { cif: "CIF_0001", label: "Người dùng", id: "stable" } }),
}));

vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config: h.jarConfig }),
}));

// The auto-fund unit is exercised in its own suites (Phase 04/05). Here we stub it
// so a category pick's reconcile step is a no-op ("covered") by default, and this
// suite stays focused on the pending-suggestion + label-mutation contract. The H1
// latch test below reconfigures `h.reconcile` to exercise the component's own
// re-entrancy guard.
vi.mock("@/state/use-auto-fund", () => ({
  useAutoFund: () => ({
    reconcile: h.reconcile,
  }),
}));

vi.mock("@/state/manual-txns", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useManualTxns: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const fn = () => force((n) => n + 1);
        h.listeners.add(fn);
        return () => {
          h.listeners.delete(fn);
        };
      }, []);
      return { manualTxns: h.store, update: h.update };
    },
  };
});

import { TransferCategorizeSection } from "../TransferCategorizeSection";

const AMOUNT = 500_000;

function seedTxn(over: Partial<MockTxn> = {}): MockTxn {
  return { id: "t1", categoryId: "transfer", type: "transfer", merchantName: "Nguyen Van A", ...over };
}

beforeEach(() => {
  h.store = [];
  h.jarConfig = { version: 3, jars: [{ id: "essentials", categoryIds: ["housing"] }] };
  h.listeners.clear();
  h.update.mockClear();
  h.update.mockImplementation((id: string, patch: Partial<MockTxn>) => {
    if (!h.store.some((t) => t.id === id)) return false;
    h.store = h.store.map((t) => (t.id === id ? { ...t, ...patch } : t));
    h.notify();
    return true;
  });
  h.reconcile.mockReset();
  h.reconcile.mockImplementation(() => ({ status: "covered" as const, donors: [], targetLabel: "hũ" }));
});

describe("TransferCategorizeSection — pending suggestion never mutates on its own", () => {
  it("a matched heuristic suggestion renders pending and does NOT call update until the user acts", async () => {
    h.store = [seedTxn({ note: "tra no thang 9" })]; // heuristic → "debt" (non-spending)
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Trả nợ / cho vay");
    expect(screen.getByText(/Đề xuất tự động/)).toBeInTheDocument(); // heuristic, never "AI đề xuất" (no ai consent)

    // Suggestion is purely visual — the record itself is untouched.
    expect(h.update).not.toHaveBeenCalled();
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });
    expect(h.store[0].transferPurpose).toBeUndefined();
  });

  it("no suggestion is shown for an unmatched memo (no fabrication)", async () => {
    h.store = [seedTxn({ note: "chuyen tien" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    // Give the async hook a tick to resolve.
    await screen.findByText("Chưa phân loại");
    expect(screen.queryByText(/Gợi ý mục đích/)).toBeNull();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("accepting a NON-spending purpose ('Đồng ý') records metadata only — type stays transfer, no jar touched", async () => {
    h.store = [seedTxn({ note: "tra no thang 9" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Trả nợ / cho vay");
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith("t1", { categoryId: "transfer", type: "transfer", transferPurpose: "debt" });
  });

  it("accepting a SPENDING purpose ('Đồng ý') flips type→expense (the category move re-routes spend)", async () => {
    h.store = [seedTxn({ note: "tien nha" })]; // heuristic → "rent" (spending, maps to "housing")
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Tiền nhà");
    expect(screen.getByText(/tính vào chi tiêu/)).toBeInTheDocument(); // spending purposes are labelled as such
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));

    // The category change alone re-routes the spend to the owning jar (derived
    // model) — no separate jar bookkeeping call.
    expect(h.update).toHaveBeenCalledWith("t1", { categoryId: "housing", type: "expense", transferPurpose: "rent" });
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("'Chọn khác' opens the full purpose picker without mutating, and a manual pick applies the SAME rule", async () => {
    h.store = [seedTxn({ note: "tra no thang 9" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Trả nợ / cho vay");
    fireEvent.click(screen.getByRole("button", { name: "Chọn khác" }));
    expect(h.update).not.toHaveBeenCalled(); // opening the picker is not itself a choice

    const dialog = await screen.findByRole("dialog");
    // Every purpose in the taxonomy is offered, not just the suggested one.
    expect(within(dialog).getByRole("button", { name: /Tiết kiệm \/ đầu tư/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Kinh doanh/ }));
    expect(h.update).toHaveBeenCalledWith("t1", { categoryId: "transfer", type: "transfer", transferPurpose: "business" });
  });

  it("a failed update surfaces an error and never optimistically charges the jar", async () => {
    h.update.mockReturnValue(false);
    h.store = [seedTxn({ note: "tien nha" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Tiền nhà");
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));

    expect(screen.getByText(/Không cập nhật được phân loại/)).toBeInTheDocument();
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" }); // record unchanged
  });

  it("no suggestion is offered once the txn is already classified (isUnclassified=false)", async () => {
    h.store = [seedTxn({ categoryId: "dining", type: "expense", note: "tra no thang 9" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Ăn uống");
    expect(screen.queryByText(/Gợi ý mục đích/)).toBeNull();
  });

  // Regression (code-review #2): a plain category pick must CLEAR a previously
  // accepted purpose, so the record looks unclassified again and can re-suggest.
  it("reverting to 'Không phân loại' after accepting a purpose clears the stale purpose", async () => {
    h.store = [seedTxn({ note: "tien nha" })]; // rent → housing (spending)
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Tiền nhà");
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));
    expect(h.store[0]).toMatchObject({ categoryId: "housing", type: "expense", transferPurpose: "rent" });

    // Open the plain picker (button now shows the mapped category label) and revert.
    fireEvent.click(screen.getByRole("button", { name: "Nhà ở" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Không phân loại" }));

    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });
    expect(h.store[0].transferPurpose).toBeUndefined(); // stale purpose cleared, not lingering
  });

  // RT-fix H1: the `inFlight` ref latch (TransferCategorizeSection.tsx `applyCategory`)
  // must drop a re-entrant tap that arrives WHILE the first confirm is still
  // executing (i.e. before the `finally` resets the latch) — never double-commit a
  // rebalance for the same label. Modeled by having the mocked `autoFund.reconcile`
  // itself fire a second "Xác nhận rút" click synchronously mid-call, simulating a
  // real double-tap landing inside the first commit's synchronous execution window.
  it("H1: a re-entrant 'Xác nhận rút' tap while the first confirm is still in-flight is dropped by the latch", async () => {
    h.store = [seedTxn({ note: "tien nha" })]; // rent → housing (spending)
    h.reconcile
      .mockImplementationOnce(() => ({
        status: "needs-goal" as const,
        donors: [],
        goalDonors: [{ jarId: "goal", label: "Hũ Mục tiêu", take: 500_000 }],
        targetLabel: "Nhà ở",
      }))
      .mockImplementationOnce(() => {
        // A second tap arrives while this (first legitimate) confirm call is still
        // on the stack — `inFlight.current` is still true (the `finally` in the
        // outer `applyCategory` call hasn't run yet).
        fireEvent.click(screen.getByRole("button", { name: "Xác nhận rút" }));
        return {
          status: "funded" as const,
          donors: [{ jarId: "goal", label: "Hũ Mục tiêu", take: 500_000 }],
          targetLabel: "Nhà ở",
        };
      });

    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);
    await screen.findByText("Tiền nhà");
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" })); // 1st reconcile call → needs-goal

    const confirmBtn = await screen.findByRole("button", { name: "Xác nhận rút" });
    fireEvent.click(confirmBtn); // 2nd reconcile call (legitimate) → the re-entrant tap fires from inside it

    // Exactly 2 calls total: the initial needs-goal assessment + the ONE legitimate
    // confirm. The re-entrant tap never reaches a 3rd `reconcile` call — the latch
    // dropped it before it could double-commit a second rebalance for "housing".
    expect(h.reconcile).toHaveBeenCalledTimes(2);
  });
});
