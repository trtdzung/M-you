import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

/**
 * The mock MSB confirm screen (OUTSIDE the AI facade). `confirm()` debits the
 * real source account and records self-reported txn(s); a jar has NO stored
 * balance, so its spendable = max(0, remaining) is DERIVED from those txns.
 * These tests lock the financial rules and the red-team fixes: type-from-kind
 * (no phantom expense), the derived charge model (single txn ok/overspend,
 * per-contributor charges on an accepted top-up), single txn under double-tap
 * (F#3), no resubmit on reload (F#2), and a visible error when the update
 * fails (F#8).
 */

interface MockTxn {
  id: string;
  categoryId: string;
  type: string;
  amount: number;
  merchantName: string;
  source: string;
}

/** Derived jar-budget lines the confirm screen reads spendable from. */
function linesFrom(remaining: Record<string, number | null>) {
  const meta = [
    { huId: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"] },
    { huId: "shop", label: "Mua sắm", categoryIds: ["shopping"] },
    { huId: "empty", label: "Rỗng", categoryIds: [] as string[] },
  ];
  return { jarBudget: { lines: meta.map((m) => ({ ...m, remaining: remaining[m.huId] ?? null })) } };
}

const h = vi.hoisted(() => {
  const state = {
    store: [] as MockTxn[],
    jarConfig: {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"] },
        { id: "shop", label: "Mua sắm", categoryIds: ["shopping"] },
        { id: "empty", label: "Rỗng", categoryIds: [] as string[] },
      ],
    },
    // Derived financials (jarBudget.lines). Set per test via `h.financials = linesFrom(...)`.
    financials: null as ReturnType<typeof linesFrom> | null,
    draft: null as Record<string, unknown> | null,
    used: {} as Record<string, boolean>,
    query: "draftId=d1",
    listAccounts: vi.fn(
      async (): Promise<Array<{ id: string; type: string; availableBalance?: number }>> => [
        { id: "acc1", type: "current" },
      ],
    ),
    applyAccountDebit: vi.fn(async () => {}),
    push: vi.fn(),
    add: vi.fn((input: { categoryId: string; type: string; amount: number; merchantName: string }) => {
      const id = `manual-test-${state.store.length + 1}`;
      state.store = [{ id, categoryId: input.categoryId, type: input.type, amount: input.amount, merchantName: input.merchantName, source: "self_reported" }, ...state.store];
      return id;
    }),
    update: vi.fn((id: string, patch: Partial<MockTxn>) => {
      if (!state.store.some((t) => t.id === id)) return false;
      state.store = state.store.map((t) => (t.id === id ? { ...t, ...patch } : t));
      return true;
    }),
  };
  return state;
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, back: () => {} }),
  useSearchParams: () => new URLSearchParams(h.query),
}));

vi.mock("@/providers/context", () => ({
  usePersona: () => ({ persona: { cif: "CIF_0001", label: "Người dùng", id: "stable" } }),
  useProviders: () => ({
    listAccounts: h.listAccounts,
    applyAccountDebit: h.applyAccountDebit,
    createBeneficiary: vi.fn(async () => {}),
  }),
}));

vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config: h.jarConfig }),
}));

vi.mock("@/state/useFinancials", () => ({
  useFinancials: () => ({ financials: h.financials }),
}));

vi.mock("@/state/manual-txns", () => ({
  MANUAL_ACCOUNT_ID: "self-reported",
  useManualTxns: () => ({ manualTxns: h.store, add: h.add, update: h.update, remove: () => {} }),
}));

vi.mock("@/lib/transfer-draft-store", () => ({
  getTransferDraft: () => h.draft,
  deleteTransferDraft: (id: string) => {
    h.used[id] = true;
    h.draft = null;
  },
  isTransferDraftUsed: (id: string) => Boolean(h.used[id]),
}));

import { TransferConfirm } from "../TransferConfirm";

const AMOUNT = 500_000;

// No `sourceAccountId` → exercises the legacy fallback (look up the single current account).
function jarDraft() {
  return { id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: AMOUNT, memo: null, sourceLabel: "Hũ Ăn uống", sourceJarId: "food" };
}
function accountDraft() {
  return { id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: AMOUNT, memo: null, sourceLabel: "Tài khoản MSB", sourceAccountId: "acc1" };
}

/** Find the created txn with a given category (donor order prepends in the store). */
function txnByCategory(categoryId: string): MockTxn | undefined {
  return h.store.find((t) => t.categoryId === categoryId);
}

async function completeTransfer() {
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));
  await screen.findByText("Chuyển tiền thành công");
}

beforeEach(() => {
  window.localStorage.clear();
  h.store = [];
  h.draft = null;
  h.used = {};
  h.query = "draftId=d1";
  // Default: food 2tr / shop 1tr spendable, empty non-fundable.
  h.financials = linesFrom({ food: 2_000_000, shop: 1_000_000, empty: null });
  h.listAccounts.mockClear();
  h.listAccounts.mockImplementation(async () => [{ id: "acc1", type: "current" }]);
  h.applyAccountDebit.mockClear();
  h.add.mockClear();
  h.update.mockClear();
  h.update.mockImplementation((id: string, patch: Partial<MockTxn>) => {
    if (!h.store.some((t) => t.id === id)) return false;
    h.store = h.store.map((t) => (t.id === id ? { ...t, ...patch } : t));
    return true;
  });
});

describe("TransferConfirm — always create + categorize", () => {
  it("jar-sourced: records the jar's first category and picker is limited to the jar", async () => {
    h.draft = jarDraft();
    render(<TransferConfirm />);
    await completeTransfer();

    // A jar source books the spend into its first category (drops derived remaining);
    // jar money lives in the CASA account → the account is debited too (legacy
    // fallback: no sourceAccountId, so the single current account is used).
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT);
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense", amount: AMOUNT });

    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Nhu yếu phẩm" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Mua sắm" })).not.toBeInTheDocument();

    // Re-category is a pure category move (no jar bookkeeping — remaining re-routes
    // via the category→jar map): only the txn's category changes.
    fireEvent.click(within(dialog).getByRole("button", { name: "Nhu yếu phẩm" }));
    expect(h.store[0]).toMatchObject({ categoryId: "groceries", type: "expense" });
    expect(h.add).toHaveBeenCalledTimes(1); // still one txn total
  });

  it("account-sourced: defaults to transfer, then re-category changes only the txn category (F#5)", async () => {
    h.draft = accountDraft();
    render(<TransferConfirm />);
    await completeTransfer();

    // Account-sourced debits the real account (uses the draft's explicit
    // sourceAccountId — no current-account lookup needed) and books a transfer txn.
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT);
    expect(h.listAccounts).not.toHaveBeenCalled();
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });

    // Pick an expense category owned by a jar → the category move alone re-routes spend.
    fireEvent.click(screen.getByRole("button", { name: /Chưa phân loại/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Mua sắm" }));
    expect(h.store[0]).toMatchObject({ categoryId: "shopping", type: "expense" });

    // Back to "Không phân loại" → transfer (still one txn, no extra add).
    fireEvent.click(screen.getByRole("button", { name: "Mua sắm" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Không phân loại" }));
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });
    expect(h.add).toHaveBeenCalledTimes(1);
  });

  it("0-category jar records type:transfer (no phantom expense, F#1)", async () => {
    h.draft = { ...jarDraft(), sourceJarId: "empty" };
    render(<TransferConfirm />);
    await completeTransfer();
    expect(h.store).toHaveLength(1);
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });
  });

  it("double-submit creates only one txn (F#3)", async () => {
    h.draft = jarDraft();
    render(<TransferConfirm />);
    const btn = screen.getByRole("button", { name: "Xác nhận chuyển tiền" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByText("Chuyển tiền thành công");
    expect(h.add).toHaveBeenCalledTimes(1);
  });

  it("reload after completion does not resubmit — shows completed state (F#2)", async () => {
    h.draft = jarDraft();
    const view = render(<TransferConfirm />);
    await completeTransfer();
    expect(h.add).toHaveBeenCalledTimes(1);

    // Remount with the same draftId — draft consumed, marked used.
    view.unmount();
    render(<TransferConfirm />);
    expect(screen.getByText("Giao dịch đã hoàn tất")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xác nhận chuyển tiền" })).not.toBeInTheDocument();
    expect(h.add).toHaveBeenCalledTimes(1);
  });

  it("a provider failure surfaces an error and stays retryable (no permanent lock)", async () => {
    h.draft = jarDraft();
    h.listAccounts.mockRejectedValueOnce(new Error("provider down"));
    render(<TransferConfirm />);
    const btn = screen.getByRole("button", { name: "Xác nhận chuyển tiền" });

    fireEvent.click(btn);
    await screen.findByText(/Không hoàn tất được giao dịch/);
    expect(h.add).not.toHaveBeenCalled(); // async failed before any local write

    // Retry now succeeds — the latch was released.
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));
    await screen.findByText("Chuyển tiền thành công");
    expect(h.add).toHaveBeenCalledTimes(1);
  });

  it("shows an error and does not change category when update fails (F#8)", async () => {
    h.draft = jarDraft();
    render(<TransferConfirm />);
    await completeTransfer();
    h.update.mockReturnValue(false);

    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Nhu yếu phẩm" }));

    expect(screen.getByText(/Không cập nhật được phân loại/)).toBeInTheDocument();
    expect(h.store[0]).toMatchObject({ categoryId: "dining" });
  });
});

/**
 * Funding top-up path (unallocated pool / donor chain). `confirm()` re-runs
 * `evaluateFunding` on the FRESHEST accounts/derived-spendable right before
 * touching money. On an accepted top-up (Approach A — spread-as-spend) it charges
 * each JAR contributor its portion as a self-reported expense (source portion +
 * each donor's take); the pool portion needs no txn (the account debit shrinks
 * the derived pool). It aborts on "insufficient" (no debit, no txn) and, for an
 * `overspend` draft, keeps the single-txn behavior so the jar goes over-budget.
 */
describe("TransferConfirm — funding top-up (Approach A: spread-as-spend)", () => {
  it("accepted top-up covered by the pool: one source-portion txn (min(amount, spendable)), debit is the full amount", async () => {
    // CASA=10tr; food(src)=2tr, shop=1tr → claimed=3tr, pool=7tr.
    // amount=2.5tr → shortfall from food = 0.5tr, fully covered by the pool (no jar donor).
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 10_000_000 }]);
    h.draft = {
      id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: 2_500_000, memo: null,
      sourceLabel: "Hũ Ăn uống", sourceJarId: "food", sourceAccountId: "acc1", plannedReallocation: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    // The account debit is the full transfer; the source jar is charged only its
    // own portion (min(2.5tr, spendable 2tr) = 2tr → remaining lands at its limit).
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 2_500_000);
    expect(h.add).toHaveBeenCalledTimes(1); // pool portion needs NO txn
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense", amount: 2_000_000 });

    // The debit is applied before the charge txns.
    expect(h.applyAccountDebit.mock.invocationCallOrder[0]).toBeLessThan(h.add.mock.invocationCallOrder[0]);
  });

  it("accepted top-up with a jar donor: source portion + donor take charged, pool portion txn-free", async () => {
    // CASA=10tr; food(src)=2tr, shop=1tr → claimed=3tr, pool=7tr.
    // amount=9.5tr → shortfall from food = 7.5tr. pool 7tr, then shop (disc) 0.5tr.
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 10_000_000 }]);
    h.draft = {
      id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: 9_500_000, memo: null,
      sourceLabel: "Hũ Ăn uống", sourceJarId: "food", sourceAccountId: "acc1", plannedReallocation: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 9_500_000);
    // Two charges: source food portion (2tr into dining) + donor shop take (0.5tr into
    // shopping). The pool's 7tr needs no txn (the account debit shrinks the pool).
    expect(h.add).toHaveBeenCalledTimes(2);
    expect(txnByCategory("dining")).toMatchObject({ amount: 2_000_000, type: "expense" });
    expect(txnByCategory("shopping")).toMatchObject({ amount: 500_000, type: "expense" });
  });

  it("POOL-sourced accepted top-up with a jar donor: full-amount transfer txn PLUS each donor take (asymmetric — primary not reduced by Σtakes)", async () => {
    // No sourceJarId → the POOL is the source. CASA=5tr; food=2tr, shop=1tr →
    // claimed=3tr, pool=2tr. amount=2.5tr → pool short by 0.5tr; the largest
    // discretionary jar (food, 2tr) donates 0.5tr. This is the ONE branch where the
    // charge total structurally exceeds the transfer amount: the primary is a
    // FULL-amount type:transfer txn (excluded from spend) and each JAR donor's take
    // is booked as a separate expense — the primary is never reduced by Σtakes.
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 5_000_000 }]);
    h.draft = {
      id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: 2_500_000, memo: null,
      sourceLabel: "Tài khoản MSB", sourceAccountId: "acc1", plannedReallocation: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    // The account debit is the full amount (never inflated by the donor take).
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 2_500_000);
    // 1 primary + donors.length (1) = 2 txns; the pool portion itself needs no txn.
    expect(h.add).toHaveBeenCalledTimes(2);
    // Primary stays the FULL amount as a transfer (not reduced by the 0.5tr take).
    expect(txnByCategory("transfer")).toMatchObject({ amount: 2_500_000, type: "transfer" });
    // The food donor is charged its take (0.5tr) into its first category.
    expect(txnByCategory("dining")).toMatchObject({ amount: 500_000, type: "expense" });
    // No pool txn: only the transfer + the single donor were written.
    expect(h.store).toHaveLength(2);
  });

  it("re-validation returns insufficient: no debit, no txn — error shown", async () => {
    // CASA=1tr < amount(2.5tr) → hard block regardless of the jar/donor chain.
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 1_000_000 }]);
    h.draft = {
      id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: 2_500_000, memo: null,
      sourceLabel: "Hũ Ăn uống", sourceJarId: "food", sourceAccountId: "acc1", plannedReallocation: true,
    };
    render(<TransferConfirm />);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));

    await screen.findByText(/Số dư không đủ để hoàn tất giao dịch/);
    expect(h.applyAccountDebit).not.toHaveBeenCalled();
    expect(h.add).not.toHaveBeenCalled();
  });

  it("overspend flag, feasible fresh state (ok tier): single full-amount txn, debit happens", async () => {
    // food spendable=2tr already covers amount=1.5tr → tier resolves "ok".
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 10_000_000 }]);
    h.draft = {
      id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: 1_500_000, memo: null,
      sourceLabel: "Hũ Ăn uống", sourceJarId: "food", sourceAccountId: "acc1", overspend: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 1_500_000);
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense", amount: 1_500_000 });
  });

  it("REGRESSION: overspend flag with fresh tier==topup keeps the SINGLE full-amount txn (jar goes over)", async () => {
    // food(src)=2tr, amount=3tr → shortfall 1tr; pool covers → fresh tier "topup".
    // "Bỏ qua, vượt hũ" (overspend) DECLINED the top-up: the source jar is charged
    // the FULL amount (3tr into dining) so its remaining goes negative — never
    // converted into a spread-as-spend top-up. No donor charges.
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 10_000_000 }]);
    h.draft = {
      id: "d1", name: "Nguyen Van A", accountMasked: "****1234", amount: 3_000_000, memo: null,
      sourceLabel: "Hũ Ăn uống", sourceJarId: "food", sourceAccountId: "acc1", overspend: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 3_000_000);
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense", amount: 3_000_000 });
  });
});
