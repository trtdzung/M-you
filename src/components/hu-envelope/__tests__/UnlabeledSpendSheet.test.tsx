import { describe, expect, it, vi, beforeEach } from "vitest";
import { type RenderOptions, render as rtlRender, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";
import type { Transaction } from "@/domain/models";
import { UNCLASSIFIED } from "@/domain/models";

const confirmCategory = vi.fn();
let unsaved = false;
vi.mock("@/state/corrections", () => ({
  useConfirmCategory: () => confirmCategory,
  useCorrections: () => ({ unsaved }),
}));

// Self-reported transfers are labelled through the manual-txn store (a type flip
// a corrections overlay cannot express); expenses still go through corrections.
const updateManualTxn = vi.fn(() => true);
vi.mock("@/state/manual-txns", () => ({
  useManualTxns: () => ({ update: updateManualTxn }),
}));

// Auto-fund is covered by its own Phase 04/05 suites; stub it to a no-op "covered"
// so labelling a spend here exercises only the confirm-category path under test.
vi.mock("@/state/use-auto-fund", () => ({
  useAutoFund: () => ({
    reconcile: () => ({ status: "covered", donors: [], targetLabel: "hũ" }),
  }),
}));

import { UnlabeledSpendSheet } from "../UnlabeledSpendSheet";


/**
 * Every render goes through `StubCategoryTaxonomy`: the components below read
 * the persona's taxonomy via `useCategories()` but own none of it, so they get
 * an already-loaded preset taxonomy instead of the real fetching provider (the
 * provider itself is covered by its own tests).
 */
const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: over.id ?? "t1",
    accountId: "acc",
    postedAt: over.postedAt ?? "2026-09-10T10:00:00.000Z",
    amount: over.amount ?? 120_000,
    currency: "VND",
    direction: "debit",
    type: "expense",
    merchantName: over.merchantName ?? "Cửa hàng ABC",
    merchantNormalizedName: over.merchantNormalizedName ?? "cua hang abc",
    categoryId: UNCLASSIFIED,
    status: "posted",
    source: "mock",
    isRecurring: false,
    userEdited: false,
    ...over,
  };
}

beforeEach(() => {
  confirmCategory.mockClear();
  updateManualTxn.mockClear();
  unsaved = false;
});

describe("UnlabeledSpendSheet", () => {
  it("lists each item by merchant + amount, keyed by id", () => {
    const items = [txn({ id: "a", merchantName: "Highlands", amount: 65_000 }), txn({ id: "b", merchantName: "Grab", amount: 48_000 })];
    render(<UnlabeledSpendSheet items={items} onClose={() => {}} />);
    expect(screen.getByText("Highlands")).toBeInTheDocument();
    expect(screen.getByText("Grab")).toBeInTheDocument();
  });

  it("picking a category calls useConfirmCategory with (txn, categoryId)", () => {
    const t = txn({ id: "a", merchantName: "Highlands" });
    render(<UnlabeledSpendSheet items={[t]} onClose={() => {}} />);
    // Open the row's picker, then pick a known expense category tile.
    fireEvent.click(screen.getByRole("button", { name: /Highlands/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ăn uống/ }));
    expect(confirmCategory).toHaveBeenCalledTimes(1);
    expect(confirmCategory.mock.calls[0][0]).toBe(t);
    expect(typeof confirmCategory.mock.calls[0][1]).toBe("string");
  });

  it("labelling a self-reported transfer flips it to an expense via the manual store (not corrections)", () => {
    const t = txn({
      id: "tr1",
      merchantName: "Nguyễn Thị Lan",
      type: "transfer",
      source: "self_reported",
      categoryId: "transfer",
    });
    render(<UnlabeledSpendSheet items={[t]} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Nguyễn Thị Lan/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ăn uống/ }));
    // The transfer is tagged as a real spend on the stored record: category + a
    // transfer→expense type flip. The corrections overlay is NOT used here.
    expect(updateManualTxn).toHaveBeenCalledTimes(1);
    expect(updateManualTxn.mock.calls[0][0]).toBe("tr1");
    expect(updateManualTxn.mock.calls[0][1]).toMatchObject({ type: "expense" });
    expect(typeof (updateManualTxn.mock.calls[0][1] as { categoryId?: string }).categoryId).toBe("string");
    expect(confirmCategory).not.toHaveBeenCalled();
  });

  it("[RT#6/#7] closes the open picker + shows a note when the active row leaves items", () => {
    const a = txn({ id: "a", merchantName: "Highlands" });
    const b = txn({ id: "b", merchantName: "Grab" });
    const { rerender } = render(<UnlabeledSpendSheet items={[a, b]} onClose={() => {}} />);
    // Open a's picker.
    fireEvent.click(screen.getByRole("button", { name: /Highlands/ }));
    expect(screen.getByRole("button", { name: /Ăn uống/ })).toBeInTheDocument();
    // a vanishes (labeled by a background/cross-tab write) → picker closes + note.
    rerender(<UnlabeledSpendSheet items={[b]} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Ăn uống/ })).not.toBeInTheDocument();
    expect(screen.getByText(/đã được gắn nhãn/i)).toBeInTheDocument();
  });

  it("[RT#8] renders the unsaved warning when useCorrections().unsaved is true", () => {
    unsaved = true;
    render(<UnlabeledSpendSheet items={[txn({ id: "a" })]} onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Chưa lưu được/);
  });

  it("shows the empty state when items is empty", () => {
    render(<UnlabeledSpendSheet items={[]} onClose={() => {}} />);
    expect(screen.getByText(/Đã gắn nhãn hết/)).toBeInTheDocument();
  });

  it("[RT#10] renders no AI/suggestion affordance", () => {
    render(<UnlabeledSpendSheet items={[txn({ id: "a" })]} onClose={() => {}} />);
    expect(screen.queryByText(/gợi ý/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI/)).not.toBeInTheDocument();
  });
});
