import { describe, expect, it, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";

/**
 * F5 / mục 9: chỉ coi là TK mục tiêu của mình khi số trùng VÀ ngân hàng MSB.
 */

const h = vi.hoisted(() => ({
  draft: null as Record<string, unknown> | null,
  query: "draftId=d1",
  applyAccountDebit: vi.fn(async (_accountId: string, _amount: number, _record?: unknown) => {}),
  listAccounts: vi.fn(async () => [
    { id: "acc1", type: "current" as const, availableBalance: 50_000_000 },
    { id: "goalacc-1", type: "goal" as const, accountNumber: "880001000001", availableBalance: 0 },
  ]),
  adopt: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  used: {} as Record<string, boolean>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace, back: () => {} }),
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
  useJarConfig: () => ({
    config: { version: 3, jars: [{ id: "food", label: "Ăn uống", categoryIds: ["dining"] }] },
  }),
}));

vi.mock("@/state/useFinancials", () => ({
  useFinancials: () => ({
    financials: { jarBudget: { lines: [{ huId: "food", label: "Ăn uống", categoryIds: ["dining"], balance: 2_000_000 }] } },
    transactions: [],
    raw: { accounts: [] },
  }),
}));

vi.mock("@/state/manual-txns", async () => {
  const actual = await vi.importActual<typeof import("@/state/manual-txns")>("@/state/manual-txns");
  return {
    MANUAL_ACCOUNT_ID: "self-reported",
    buildManualTxn: actual.buildManualTxn,
    useManualTxns: () => ({
      manualTxns: [],
      add: () => "x",
      addPersisted: async () => "x",
      adopt: h.adopt,
      update: () => true,
      remove: () => {},
      removeByTrigger: () => [],
    }),
  };
});

vi.mock("@/state/use-auto-fund", () => ({
  useAutoFund: () => ({
    assess: () => ({
      assessment: { tier: "ok", shortfall: 0, donors: [], targetJarId: null, source: "mock" },
      snapshot: { spendables: [], casaBalance: 50_000_000, lines: [], month: "2026-10" },
    }),
    commit: () => [],
    commitPersisted: async () => [],
    reconcile: () => null,
    undo: () => ({ status: "undone" }),
    changeSource: () => ({ status: "nothing", ids: [], shortfall: 0 }),
    swapOptions: () => ({ shortfall: 0, options: [] }),
    fundJar: () => ({ status: "covered", donors: [], shortfall: 0, createdIds: [], targetJarId: null, targetLabel: "", postedAt: "" }),
    removeByTrigger: () => [],
    jarConfig: { version: 3, jars: [] },
  }),
}));

vi.mock("@/lib/transfer-draft-store", () => ({
  getTransferDraft: () => h.draft,
  deleteTransferDraft: () => {
    h.draft = null;
  },
  isTransferDraftUsed: (id: string) => Boolean(h.used[id]),
}));

vi.mock("@/lib/security/events", () => ({
  postSecurityEvent: vi.fn(async () => {}),
}));

import { TransferConfirm } from "../TransferConfirm";

const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

beforeEach(() => {
  h.applyAccountDebit.mockClear();
  h.adopt.mockClear();
  h.listAccounts.mockClear();
  h.used = {};
  h.query = "draftId=d1";
});

async function confirm() {
  const button = screen.getByRole("button", { name: "Xác nhận chuyển tiền" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(h.applyAccountDebit).toHaveBeenCalled());
}

describe("TransferConfirm — nhận diện TK mục tiêu (MSB + số)", () => {
  /** Nguồn hũ: mặc định category = dining; chỉ khi toOwnGoal mới ép transfer. */
  function jarToGoalDraft(bank: string) {
    return {
      id: "d1",
      name: "Mục tiêu xe",
      accountNumber: "880001000001",
      accountMasked: "****0001",
      amount: 100_000,
      memo: null,
      sourceLabel: "Hũ Ăn uống",
      sourceJarId: "food",
      recipientBankName: bank,
    };
  }

  it("số trùng + ngân hàng MSB → ép type/category transfer (dù nguồn hũ)", async () => {
    h.draft = jarToGoalDraft("MSB");
    render(<TransferConfirm />);
    await confirm();
    const record = h.applyAccountDebit.mock.calls[0]?.[2] as {
      type: string;
      categoryId: string;
      counterpartyAccountNumber: string;
      counterpartyBankName: string;
    };
    expect(record).toBeTruthy();
    expect(record.type).toBe("transfer");
    expect(record.categoryId).toBe("transfer");
    expect(record.counterpartyAccountNumber).toBe("880001000001");
    expect(record.counterpartyBankName).toBe("MSB");
  });

  it("số trùng nhưng ngân hàng khác MSB → không ép transfer (giữ category hũ)", async () => {
    h.draft = jarToGoalDraft("Vietcombank");
    render(<TransferConfirm />);
    await confirm();
    const record = h.applyAccountDebit.mock.calls[0]?.[2] as {
      type: string;
      categoryId: string;
      counterpartyBankName: string;
    };
    expect(record).toBeTruthy();
    expect(record.counterpartyBankName).toBe("Vietcombank");
    expect(record.categoryId).toBe("dining");
    expect(record.type).not.toBe("transfer");
  });
});
