import { describe, expect, it, vi, beforeEach } from "vitest";
import { type RenderOptions, render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";

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
    casaBalance: 100_000_000,
    commit: vi.fn(),
    // Awaited leg writes (H14): resolves with `createdIds` unless a test rejects it.
    commitPersisted: vi.fn(async (..._args: unknown[]): Promise<string[]> => []),
    assess: vi.fn(),
    draft: null as Record<string, unknown> | null,
    used: {} as Record<string, boolean>,
    query: "draftId=d1",
    listAccounts: vi.fn(
      async (): Promise<Array<{ id: string; type: string; availableBalance?: number }>> => [
        { id: "acc1", type: "current" },
      ],
    ),
    applyAccountDebit: vi.fn(async (_accountId: string, _amount: number, _record?: unknown) => {}),
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
    // The primary txn is stored by the debit endpoint and only ADOPTED locally.
    adopt: vi.fn((txn: MockTxn & { postedAt?: string }) => {
      state.store = [{ ...txn, source: "self_reported" }, ...state.store];
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

vi.mock("@/state/manual-txns", async () => {
  const actual = await vi.importActual<typeof import("@/state/manual-txns")>("@/state/manual-txns");
  return {
    MANUAL_ACCOUNT_ID: "self-reported",
    buildManualTxn: actual.buildManualTxn, // the real record builder
    useManualTxns: () => ({
      manualTxns: h.store,
      add: h.add,
      addPersisted: async (input: Parameters<typeof h.add>[0]) => h.add(input),
      adopt: h.adopt,
      update: h.update,
      remove: () => {},
      removeByTrigger: () => [],
    }),
  };
});

// The shared auto-fund unit is exercised against the engine elsewhere; here it is a
// controllable stub so the confirm screen's OWN responsibilities (assess-then-commit
// ordering, single primary txn, latch, error) are tested in isolation.
vi.mock("@/state/use-auto-fund", () => ({
  useAutoFund: () => ({
    assess: (p: unknown) => {
      h.assess(p);
      return { assessment: h.assessment, snapshot: { spendables: [], casaBalance: h.casaBalance, lines: [], month: "2026-09" } };
    },
    commit: (...args: unknown[]) => {
      h.commit(...args);
      return h.createdIds;
    },
    commitPersisted: h.commitPersisted,
    reconcile: () => null,
    undo: () => ({ status: "undone" }),
    changeSource: () => ({ status: "nothing", ids: [], shortfall: 0 }),
    swapOptions: () => ({ shortfall: 0, options: [] }),
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


/**
 * Every render goes through `StubCategoryTaxonomy`: the components below read
 * the persona's taxonomy via `useCategories()` but own none of it, so they get
 * an already-loaded preset taxonomy instead of the real fetching provider (the
 * provider itself is covered by its own tests).
 */
const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

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
  h.adopt.mockClear();
  h.update.mockClear();
  h.commit.mockClear();
  h.assess.mockClear();
  h.casaBalance = 100_000_000;
  h.commitPersisted.mockReset();
  h.commitPersisted.mockImplementation(async (...args: unknown[]) => {
    h.commit(...args);
    return h.createdIds;
  });
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
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT, expect.objectContaining({ amount: AMOUNT, direction: "debit" }));
    expect(h.adopt).toHaveBeenCalledTimes(1);
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense", amount: AMOUNT });

    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Nhu yếu phẩm" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Mua sắm" })).not.toBeInTheDocument();

    // Re-category is a pure category move (no jar bookkeeping — remaining re-routes
    // via the category→jar map): only the txn's category changes.
    fireEvent.click(within(dialog).getByRole("button", { name: "Nhu yếu phẩm" }));
    expect(h.store[0]).toMatchObject({ categoryId: "groceries", type: "expense" });
    expect(h.adopt).toHaveBeenCalledTimes(1); // still one txn total
  });

  it("account-sourced: defaults to transfer, then re-category changes only the txn category (F#5)", async () => {
    h.draft = accountDraft();
    render(<TransferConfirm />);
    await completeTransfer();

    // Account-sourced debits the real account (uses the draft's explicit
    // sourceAccountId — no current-account lookup needed) and books a transfer txn.
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT, expect.objectContaining({ amount: AMOUNT, direction: "debit" }));
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
    expect(h.adopt).toHaveBeenCalledTimes(1);
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
    expect(h.adopt).toHaveBeenCalledTimes(1);
  });

  it("reload after completion does not resubmit — shows completed state (F#2)", async () => {
    h.draft = jarDraft();
    const view = render(<TransferConfirm />);
    await completeTransfer();
    expect(h.adopt).toHaveBeenCalledTimes(1);

    // Remount with the same draftId — draft consumed, marked used.
    view.unmount();
    render(<TransferConfirm />);
    expect(screen.getByText("Giao dịch đã hoàn tất")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xác nhận chuyển tiền" })).not.toBeInTheDocument();
    expect(h.adopt).toHaveBeenCalledTimes(1);
  });

  it("a provider failure surfaces an error and stays retryable (no permanent lock)", async () => {
    h.draft = jarDraft();
    h.listAccounts.mockRejectedValueOnce(new Error("provider down"));
    render(<TransferConfirm />);
    const btn = screen.getByRole("button", { name: "Xác nhận chuyển tiền" });

    fireEvent.click(btn);
    await screen.findByText(/Không hoàn tất được giao dịch/);
    expect(h.adopt).not.toHaveBeenCalled(); // async failed before any local write

    // Retry now succeeds — the latch was released.
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));
    await screen.findByText("Chuyển tiền thành công");
    expect(h.adopt).toHaveBeenCalledTimes(1);
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
    expect(h.adopt).not.toHaveBeenCalled();
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
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT, expect.objectContaining({ amount: AMOUNT, direction: "debit" }));
    expect(h.adopt).toHaveBeenCalledTimes(1);
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense", amount: AMOUNT });
    // Coverage is delegated to the shared unit (one rebalance per donor), not booked here.
    expect(h.commit).toHaveBeenCalledTimes(1);
    // The post-fund banner surfaces the donor. It is read-only — no Hoàn tác /
    // Đổi nguồn action (that mechanic was removed; see AutoFundResultBanner).
    expect(await screen.findByText(/Đã bù/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hoàn tác/ })).not.toBeInTheDocument();
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
    expect(h.adopt).not.toHaveBeenCalled();

    // Explicit confirm proceeds: books the primary + commits the goal chain.
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận rút" }));
    await screen.findByText("Chuyển tiền thành công");
    expect(h.adopt).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledTimes(1);
  });
});

/**
 * Edge fixes (plan 260919-1915): H14/U1 atomic debit + record, S10/U7 one clock,
 * H11/U16 no empty donor list when the amount exceeds CASA.
 */
describe("TransferConfirm — write-path / clock / preview edge fixes", () => {
  it("H14/U1: a failed debit+record write shows an error — no success screen, no local txn, draft kept", async () => {
    h.draft = jarDraft();
    h.applyAccountDebit.mockRejectedValueOnce(new Error("manual-transactions 500"));
    render(<TransferConfirm />);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));

    await screen.findByText(/Không hoàn tất được giao dịch/);
    expect(screen.queryByText("Chuyển tiền thành công")).not.toBeInTheDocument();
    expect(h.adopt).not.toHaveBeenCalled();
    expect(h.store).toHaveLength(0);
    expect(h.used.d1).toBeUndefined(); // draft NOT consumed — the user can retry
    // The record travels WITH the debit (one server transaction), never separately.
    const [, , record] = h.applyAccountDebit.mock.calls[0];
    expect(record).toMatchObject({ amount: AMOUNT, direction: "debit", categoryId: "dining" });

    // Retry of the SAME transfer reuses the record id (server-side replay guard).
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));
    await screen.findByText("Chuyển tiền thành công");
    const retryRecord = h.applyAccountDebit.mock.calls[1][2] as { id: string };
    expect(retryRecord.id).toBe((record as { id: string }).id);
    expect(h.adopt).toHaveBeenCalledWith(expect.objectContaining({ id: retryRecord.id }));
  });

  it("H14/U1: a failed rebalance leg after the debit is surfaced on the receipt, never 'Đã bù'", async () => {
    h.assessment = {
      tier: "topup", shortfall: 200_000, requiresManualGoal: false, goalDonors: [], targetJarId: "food", source: "mock",
      donors: [{ jarId: "shop", label: "Hũ Mua sắm", take: 200_000 }],
    };
    h.commitPersisted.mockRejectedValueOnce(new Error("leg 500"));
    h.draft = jarDraft();
    render(<TransferConfirm />);
    await completeTransfer();
    expect(screen.getByRole("alert")).toHaveTextContent(/Chưa bù được 200\.000.*hũ Ăn uống.*cần bù thủ công/);
    expect(screen.queryByText(/Đã bù/)).not.toBeInTheDocument();
  });

  it("S10/U7: assessment + posted date use the demo clock even when the real clock is in another month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T03:00:00.000Z"));
    try {
      h.draft = jarDraft();
      render(<TransferConfirm />);
      await completeTransfer();
      const assessedAt = h.assess.mock.calls.map((c) => (c[0] as { postedAt: string }).postedAt);
      expect(assessedAt.length).toBeGreaterThan(0);
      expect(assessedAt.every((d) => d.startsWith("2026-09-15"))).toBe(true);
      const record = h.applyAccountDebit.mock.calls[0][2] as { postedAt: string };
      expect(record.postedAt).toBe("2026-09-15T03:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("H11/U16: amount above CASA shows the plain 'Số dư không đủ' state — never an empty donor list", async () => {
    h.casaBalance = 680_000;
    h.assessment = { tier: "insufficient", shortfall: 820_000, donors: [], goalDonors: [], requiresManualGoal: false, targetJarId: "food", source: "mock" };
    h.draft = jarDraft();
    render(<TransferConfirm />);
    fireEvent.change(screen.getByDisplayValue(String(AMOUNT)), { target: { value: "1500000" } });

    expect(await screen.findByRole("alert", { name: "Số dư không đủ" })).toHaveTextContent(/680\.000/);
    expect(screen.queryByRole("region", { name: "Dự kiến bù hũ" })).not.toBeInTheDocument();
    expect(screen.queryByText(/rót từ/)).not.toBeInTheDocument();
  });

  it("H11: a topup with donors still lists them (list only when there are donors)", async () => {
    h.assessment = {
      tier: "topup", shortfall: 300_000, requiresManualGoal: false, goalDonors: [], targetJarId: "food", source: "mock",
      donors: [{ jarId: "shop", label: "Hũ Mua sắm", take: 300_000 }],
    };
    h.draft = jarDraft();
    render(<TransferConfirm />);
    const region = await screen.findByRole("region", { name: "Dự kiến bù hũ" });
    expect(within(region).getByText("Hũ Mua sắm")).toBeInTheDocument();
  });
});
