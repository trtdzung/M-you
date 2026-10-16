import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

/**
 * The mock MSB confirm screen (OUTSIDE the AI facade). `confirm()` was rewritten
 * to ALWAYS record exactly one self-reported txn and let the user optionally
 * categorize it. These tests lock the financial rules and the red-team fixes:
 * type-from-kind (no phantom expense), jar debit/refund on re-category (F#5),
 * single txn under double-tap (F#3), no resubmit on reload (F#2), and a visible
 * error when the update fails (F#8).
 */

interface MockTxn {
  id: string;
  categoryId: string;
  type: string;
  amount: number;
  merchantName: string;
  source: string;
}

const h = vi.hoisted(() => {
  const state = {
    store: [] as MockTxn[],
    jarConfig: {
      version: 3,
      jars: [
        { id: "food", name: "Ăn uống", categoryIds: ["dining", "groceries"], actualAmount: 2_000_000 },
        { id: "shop", name: "Mua sắm", categoryIds: ["shopping"], actualAmount: 1_000_000 },
        { id: "empty", name: "Rỗng", categoryIds: [] as string[], actualAmount: 0 },
      ],
    },
    draft: null as Record<string, unknown> | null,
    used: {} as Record<string, boolean>,
    query: "draftId=d1",
    spendFromJar: vi.fn(),
    applyReallocation: vi.fn(async () => {}),
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
  useJarConfig: () => ({ config: h.jarConfig, spendFromJar: h.spendFromJar, applyReallocation: h.applyReallocation }),
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

async function completeTransfer() {
  fireEvent.change(screen.getByPlaceholderText("Bạn tự nhập OTP"), { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));
  await screen.findByText("Chuyển tiền thành công");
}

beforeEach(() => {
  window.localStorage.clear();
  h.store = [];
  h.draft = null;
  h.used = {};
  h.query = "draftId=d1";
  h.spendFromJar.mockClear();
  h.applyReallocation.mockClear();
  h.applyReallocation.mockImplementation(async () => {});
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

    expect(h.spendFromJar).toHaveBeenCalledTimes(1);
    expect(h.spendFromJar).toHaveBeenCalledWith("food", AMOUNT);
    // Jar money lives in the CASA account → the account is debited too (legacy
    // fallback: no sourceAccountId, so the single current account is used).
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT);
    expect(h.store[0]).toMatchObject({ categoryId: "dining", type: "expense" });

    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Nhu yếu phẩm" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Mua sắm" })).not.toBeInTheDocument();

    // Same-jar re-category: no extra jar debit.
    fireEvent.click(within(dialog).getByRole("button", { name: "Nhu yếu phẩm" }));
    expect(h.store[0]).toMatchObject({ categoryId: "groceries", type: "expense" });
    expect(h.spendFromJar).toHaveBeenCalledTimes(1);
  });

  it("account-sourced: defaults to transfer, then debits/refunds the jar on re-category (F#5)", async () => {
    h.draft = accountDraft();
    render(<TransferConfirm />);
    await completeTransfer();

    expect(h.spendFromJar).not.toHaveBeenCalled();
    // Account-sourced STILL debits the real account (the reported bug: previously
    // it debited nothing, so the balance never dropped). Uses the draft's explicit
    // sourceAccountId — no current-account lookup needed.
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", AMOUNT);
    expect(h.listAccounts).not.toHaveBeenCalled();
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });

    // Pick an expense category owned by a jar → charge that jar once.
    fireEvent.click(screen.getByRole("button", { name: /Chưa phân loại/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Mua sắm" }));
    expect(h.store[0]).toMatchObject({ categoryId: "shopping", type: "expense" });
    expect(h.spendFromJar).toHaveBeenCalledWith("shop", AMOUNT);

    // Back to "Không phân loại" → refund that jar.
    fireEvent.click(screen.getByRole("button", { name: "Mua sắm" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Không phân loại" }));
    expect(h.store[0]).toMatchObject({ categoryId: "transfer", type: "transfer" });
    expect(h.spendFromJar).toHaveBeenCalledWith("shop", -AMOUNT);
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
    fireEvent.change(screen.getByPlaceholderText("Bạn tự nhập OTP"), { target: { value: "1234" } });
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
    fireEvent.change(screen.getByPlaceholderText("Bạn tự nhập OTP"), { target: { value: "1234" } });
    const btn = screen.getByRole("button", { name: "Xác nhận chuyển tiền" });

    fireEvent.click(btn);
    await screen.findByText(/Không hoàn tất được giao dịch/);
    expect(h.add).not.toHaveBeenCalled();
    expect(h.spendFromJar).not.toHaveBeenCalled(); // async failed before any local debit

    // Retry now succeeds — the latch was released.
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));
    await screen.findByText("Chuyển tiền thành công");
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.spendFromJar).toHaveBeenCalledTimes(1);
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
 * Funding reallocation path (EPIC — unallocated pool / donor chain). `confirm()`
 * re-runs `evaluateFunding` on the FRESHEST accounts/jars right before touching
 * money: a `plannedReallocation`/`overspend` draft only reallocates when the
 * fresh tier is still "topup", aborts outright on "insufficient" (no debit, no
 * jar mutation), and skips reallocation on "ok" (state already improved). The
 * jar fixture here (food actualAmount 2_000_000) comes from the shared `h.jarConfig`.
 */
describe("TransferConfirm — funding reallocation (topup/insufficient/overspend)", () => {
  it('plannedReallocation topup: applyReallocation runs BEFORE the debit, then the debit happens', async () => {
    // CASA=10tr; food(src)=2tr, shop=1tr, empty=0 → claimed=3tr, pool=7tr.
    // amount=2.5tr → shortfall from food = 0.5tr, fully covered by the pool.
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 10_000_000 }]);
    h.draft = {
      id: "d1",
      name: "Nguyen Van A",
      accountMasked: "****1234",
      amount: 2_500_000,
      memo: null,
      sourceLabel: "Hũ Ăn uống",
      sourceJarId: "food",
      sourceAccountId: "acc1",
      plannedReallocation: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    expect(h.applyReallocation).toHaveBeenCalledTimes(1);
    expect(h.applyReallocation).toHaveBeenCalledWith({
      donors: [{ jarId: "pool", label: "Chưa phân bổ", take: 500_000 }],
      targetJarId: "food",
    });
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 2_500_000);
    expect(h.spendFromJar).toHaveBeenCalledWith("food", 2_500_000);

    // Reallocation is applied ATOMICALLY before the debit — never after.
    const reallocOrder = h.applyReallocation.mock.invocationCallOrder[0];
    const debitOrder = h.applyAccountDebit.mock.invocationCallOrder[0];
    expect(reallocOrder).toBeLessThan(debitOrder);
  });

  it("re-validation returns insufficient: no debit, no reallocation, no txn — error shown", async () => {
    // CASA=1tr < amount(2.5tr) → hard block regardless of the jar/donor chain.
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 1_000_000 }]);
    h.draft = {
      id: "d1",
      name: "Nguyen Van A",
      accountMasked: "****1234",
      amount: 2_500_000,
      memo: null,
      sourceLabel: "Hũ Ăn uống",
      sourceJarId: "food",
      sourceAccountId: "acc1",
      plannedReallocation: true,
    };
    render(<TransferConfirm />);
    fireEvent.change(screen.getByPlaceholderText("Bạn tự nhập OTP"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chuyển tiền" }));

    await screen.findByText(/Số dư không đủ để hoàn tất giao dịch/);
    expect(h.applyReallocation).not.toHaveBeenCalled();
    expect(h.applyAccountDebit).not.toHaveBeenCalled();
    expect(h.spendFromJar).not.toHaveBeenCalled();
    expect(h.add).not.toHaveBeenCalled();
  });

  it("overspend flag but a feasible fresh state: debit happens, reallocation is skipped", async () => {
    // food actualAmount=2tr already covers amount=1.5tr → tier resolves "ok".
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 10_000_000 }]);
    h.draft = {
      id: "d1",
      name: "Nguyen Van A",
      accountMasked: "****1234",
      amount: 1_500_000,
      memo: null,
      sourceLabel: "Hũ Ăn uống",
      sourceJarId: "food",
      sourceAccountId: "acc1",
      overspend: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    expect(h.applyReallocation).not.toHaveBeenCalled();
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 1_500_000);
    expect(h.spendFromJar).toHaveBeenCalledWith("food", 1_500_000);
  });

  it("REGRESSION: overspend flag with fresh tier==topup still skips reallocation — debit + floored spendFromJar happen anyway", async () => {
    // food(src)=2tr, amount=3tr → shortfall 1tr from food; CASA=10tr, claimed=3tr,
    // pool=7tr → fresh evaluateFunding resolves "topup" (pool alone covers it).
    // The bug: applyReallocation used to fire whenever tier==="topup", ignoring
    // that the user picked "Bỏ qua, vượt hũ" (overspend), not "Đồng ý rót"
    // (plannedReallocation). The fix gates on `draft.plannedReallocation &&
    // tier === "topup"` — an overspend draft must fall through to the debit and
    // let the jar go over-budget (spendFromJar floors internally at 0).
    h.listAccounts.mockResolvedValueOnce([{ id: "acc1", type: "current", availableBalance: 10_000_000 }]);
    h.draft = {
      id: "d1",
      name: "Nguyen Van A",
      accountMasked: "****1234",
      amount: 3_000_000,
      memo: null,
      sourceLabel: "Hũ Ăn uống",
      sourceJarId: "food",
      sourceAccountId: "acc1",
      overspend: true,
    };
    render(<TransferConfirm />);
    await completeTransfer();

    expect(h.applyReallocation).not.toHaveBeenCalled();
    expect(h.applyAccountDebit).toHaveBeenCalledWith("acc1", 3_000_000);
    expect(h.spendFromJar).toHaveBeenCalledWith("food", 3_000_000);
  });
});
