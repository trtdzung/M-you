import { describe, expect, it, vi, beforeEach } from "vitest";
import { type RenderOptions, render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";

/**
 * `TransferCategorizeSection` — the transfer CATEGORY suggestion + accept flow
 * (invariant #6-safe): a heuristic/AI suggestion is ALWAYS pending and must
 * NEVER by itself mutate the record; only the user tapping a choice does
 * ("Đồng ý" on the banner or a manual pick in the sheet). Accepting flips the
 * txn transfer→expense (the category change alone re-routes spend to the owning
 * jar — derived model, no separate bookkeeping); a transfer left untouched stays
 * `type:"transfer"` and is excluded from spend.
 *
 * Mirrors the mocking pattern in `TransferConfirm.test.tsx`: `@/state/jars`
 * and `@/state/manual-txns` are mocked with an in-memory store so the test
 * is deterministic and never touches the real `/api/jars` network boundary.
 * `useTransferCategorySuggestion` and its local heuristic run for REAL (no "ai"
 * consent granted ⇒ no network, per `src/lib/consent.ts` defaulting to no
 * scopes) — this is the actual production classify path, not a stub of the hook.
 * A recipient name matching a merchant keyword (e.g. "Shopee", "Winmart") gives
 * the heuristic a deterministic hit; an ordinary personal name matches nothing.
 */

interface MockTxn {
  id: string;
  categoryId: string;
  type: string;
  merchantName: string;
  note?: string;
}

type MockDonor = { jarId: string; label: string; take: number };
// Loose shape of what `useAutoFund().reconcile` returns, widened across every
// status so `mockImplementationOnce` type-checks.
type MockReconcileResult = {
  status: "covered" | "funded" | "insufficient";
  donors: MockDonor[];
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


/**
 * Every render goes through `StubCategoryTaxonomy`: the components below read
 * the persona's taxonomy via `useCategories()` but own none of it, so they get
 * an already-loaded preset taxonomy instead of the real fetching provider (the
 * provider itself is covered by its own tests).
 */
const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

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

describe("TransferCategorizeSection — pending category suggestion never mutates on its own", () => {
  it("a matched heuristic suggestion renders pending and does NOT call update until the user acts", async () => {
    h.store = [seedTxn({ merchantName: "Shopee" })]; // heuristic → "shopping" (Mua sắm)
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Mua sắm");
    expect(screen.getByText(/Đề xuất tự động/)).toBeInTheDocument(); // heuristic, never "AI đề xuất" (no ai consent)

    // Suggestion is purely visual — the record itself is untouched.
    expect(h.update).not.toHaveBeenCalled();
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });
  });

  it("no suggestion is shown for an unmatched recipient name (no fabrication)", async () => {
    h.store = [seedTxn({ merchantName: "Nguyen Van A" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    // Give the async hook a tick to resolve.
    await screen.findByText("Chưa phân loại");
    expect(screen.queryByText(/Gợi ý danh mục/)).toBeNull();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("accepting a suggestion ('Đồng ý') flips type→expense (the category move re-routes spend)", async () => {
    h.store = [seedTxn({ merchantName: "Winmart" })]; // heuristic → "groceries" (Nhu yếu phẩm)
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Nhu yếu phẩm");
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));

    // The category change alone re-routes the spend to the owning jar (derived
    // model) — no separate jar bookkeeping call.
    expect(h.update).toHaveBeenCalledWith("t1", { categoryId: "groceries", type: "expense" });
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("'Chọn khác' opens the full category picker without mutating, and a manual pick applies", async () => {
    h.store = [seedTxn({ merchantName: "Shopee" })]; // heuristic → "shopping"
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Mua sắm");
    fireEvent.click(screen.getByRole("button", { name: "Chọn khác" }));
    expect(h.update).not.toHaveBeenCalled(); // opening the picker is not itself a choice

    const dialog = await screen.findByRole("dialog");
    // The full expense taxonomy is offered, not just the suggested one.
    fireEvent.click(within(dialog).getByRole("button", { name: /Giải trí/ }));
    expect(h.update).toHaveBeenCalledWith("t1", { categoryId: "entertainment", type: "expense" });
  });

  it("a failed update surfaces an error and never optimistically charges the jar", async () => {
    h.update.mockReturnValue(false);
    h.store = [seedTxn({ merchantName: "Winmart" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Nhu yếu phẩm");
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));

    expect(screen.getByText(/Không cập nhật được phân loại/)).toBeInTheDocument();
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" }); // record unchanged
  });

  it("no suggestion is offered once the txn is already classified (isUnclassified=false)", async () => {
    h.store = [seedTxn({ categoryId: "dining", type: "expense", merchantName: "Shopee" })];
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Ăn uống");
    expect(screen.queryByText(/Gợi ý danh mục/)).toBeNull();
  });

  // A plain "Không phân loại" pick reverts a categorised transfer back to a plain
  // transfer (excluded from spend), so the record looks unclassified again.
  it("reverting to 'Không phân loại' after categorising clears the category back to transfer", async () => {
    h.store = [seedTxn({ merchantName: "Winmart" })]; // heuristic → groceries
    render(<TransferCategorizeSection txnId="t1" sourceJarId={null} amount={AMOUNT} />);

    await screen.findByText("Nhu yếu phẩm");
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));
    expect(h.store[0]).toMatchObject({ categoryId: "groceries", type: "expense" });

    // Open the plain picker (button now shows the mapped category label) and revert.
    fireEvent.click(screen.getByRole("button", { name: "Nhu yếu phẩm" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Không phân loại" }));

    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });
  });
});
