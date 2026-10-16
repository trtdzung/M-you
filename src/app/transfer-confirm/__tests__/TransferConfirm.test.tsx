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
    // The shared auto-fund unit is mocked (its own logic is tested against the engine
    // separately). `assess` returns this verdict; `commit` returns these rebalance ids.
    assessment: { tier: "ok", shortfall: 0, donors: [], goalDonors: [], requiresManualGoal: false, targetJarId: null, source: "mock" } as Record<string, unknown>,
    createdIds: [] as string[],
    commit: vi.fn(),
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
  useFinancials: () => ({ financials: h.financials, transactions: [], raw: { accounts: [] } }),
}));

vi.mock("@/state/manual-txns", () => ({
  MANUAL_ACCOUNT_ID: "self-reported",
  useManualTxns: () => ({ manualTxns: h.store, add: h.add, update: h.update, remove: () => {}, removeByTrigger: () => [] }),
}));

// The shared auto-fund unit is exercised against the engine elsewhere; here it is a
// controllable stub so the confirm screen's OWN responsibilities (assess-then-commit
// ordering, single primary txn, latch, error) are tested in isolation.
vi.mock("@/state/use-auto-fund", () => ({
  useAutoFund: () => ({
    assess: () => ({ assessment: h.assessment, snapshot: { spendables: [], casaBalance: 0, lines: [], month: "2026-09" } }),
    commit: (...args: unknown[]) => {
      h.commit(...args);
      return h.createdIds;
    },
    reconcile: () => null,
    undo: () => ({ status: "undone" }),
    changeSource: () => [],
    fundJar: () => ({ status: "covered", donors: [], goalDonors: [], shortfall: 0, createdIds: [], targetJarId: null, targetLabel: "", postedAt: "" }),
    removeByTrigger: () => [],
    jarConfig: h.jarConfig,
  }),
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
  h.commit.mockClear();
  h.assessment = { tier: "ok", shortfall: 0, donors: [], goalDonors: [], requiresManualGoal: false, targetJarId: null, source: "mock" };
  h.createdIds = [];
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
 * Auto-fund path (plan 260918-1120, Phase 04) — the confirm screen ASSESSES first
 * (C3), resolves insufficient/goal BEFORE any spend is booked, then books the FULL
 * amount into the source jar's real category and delegates inter-jar coverage to the
 * shared unit's `commit` (one `dieu-chinh-hu` rebalance per donor). Spread-as-spend
 * is gone: the primary is never split into per-donor expense charges.
 */
describe("TransferConfirm — auto-fund (assess-then-commit)", () => {
  it("insufficient blocks: no debit, no txn, error shown (C3)", async () => {
    h.assessment = { tier: "insufficient", shortfall: 500_000, donors: [], goalDonors: [], requiresManualGoal: false, targetJarId: "food", source: "mock" };
    h.draft = jarDraft();
    render(<TransferConfirm />);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));

    await screen.findByText(/Số dư không đủ để hoàn tất giao dịch/);
    expect(h.applyAccountDebit).not.toHaveBeenCalled();
    expect(h.add).not.toHaveBeenCalled();
  });

  it("topup: books the FULL amount into the jar category, then commits the rebalance", async () => {
    h.assessment = {
      tier: "topup", shortfall: 1_000_000, requiresManualGoal: false, goalDonors: [], targetJarId: "food", source: "mock",
      donors: [{ jarId: "shop", label: "Hũ Mua sắm", take: 1_000_000 }],
    };
    h.createdIds = ["reb-1"];
    h.draft = jarDraft();
    render(<TransferConfirm />);
    await completeTransfer();

    // Real spend keeps its real category at its FULL amount — NOT split per donor.
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT);
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense", amount: AMOUNT });
    // Coverage is delegated to the shared unit (one rebalance per donor), not booked here.
    expect(h.commit).toHaveBeenCalledTimes(1);
    // The post-fund toast surfaces the donor + Hoàn tác / Đổi nguồn.
    expect(await screen.findByText(/Đã bù/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hoàn tác/ })).toBeInTheDocument();
  });

  it("requiresManualGoal: prompts BEFORE booking, and confirm proceeds (no silent goal raid)", async () => {
    h.assessment = {
      tier: "insufficient", shortfall: 1_000_000, requiresManualGoal: true, targetJarId: "food", source: "mock",
      donors: [], goalDonors: [{ jarId: "goalJar", label: "Hũ Mục tiêu", take: 1_000_000 }],
    };
    h.createdIds = ["reb-goal"];
    h.draft = jarDraft();
    render(<TransferConfirm />);

    // First tap surfaces the goal-confirm — nothing booked yet (C3).
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));
    expect(await screen.findByText(/Cần rút từ hũ Mục tiêu/)).toBeInTheDocument();
    expect(h.applyAccountDebit).not.toHaveBeenCalled();
    expect(h.add).not.toHaveBeenCalled();

    // Explicit confirm proceeds: books the primary + commits the goal chain.
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận rút" }));
    await screen.findByText("Chuyển tiền thành công");
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledTimes(1);
  });
});
