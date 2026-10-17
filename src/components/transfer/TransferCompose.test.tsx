import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, JarConfig, Transaction } from "@/domain/models";

const casa = (balance: number) => ({ id: "current", type: "current", institution: "MSB", currency: "VND", balance, availableBalance: balance, lastSyncedAt: "2026-01-01", source: "mock", maskedNumber: "•••• 1991", accountNumber: "19881988181991" }) as Account;

const { push, putDraft, providers, h } = vi.hoisted(() => {
  const h = {
    accounts: [] as Account[],
    transactions: [] as Transaction[],
    jarConfig: { version: 3, jars: [] } as JarConfig,
    jarsLoaded: false,
    financialsLoaded: false,
  };
  return {
    h,
    push: vi.fn(),
    putDraft: vi.fn(),
    providers: {
      listBeneficiaries: async () => [{ id: "b1", name: "Lan Anh", accountNumber: "0281000556677", bankName: "MSB", source: "mock" }],
      listTransactions: async () => [],
      listAccounts: async () => h.accounts,
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/transfer-draft-store", () => ({ putTransferDraft: putDraft }));
vi.mock("@/providers/context", () => ({
  useProviders: () => providers,
  usePersona: () => ({ persona: { cif: "CIF_TEST" } }),
}));
// The top-up popup asks the agent for a split; here there is no agent, so it must fall back to the engine chain.
vi.mock("@/lib/agent-api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/agent-api")>()),
  requestJarCover: vi.fn().mockRejectedValue(new Error("no agent in tests")),
}));
// The static config reads as MIGRATED (opening deposit = limit at the demo month
// start, like the seeded DB), memoised per config so its identity is stable.
vi.mock("@/state/jars", async () => {
  const { monthAnchor, withSeedDeposits } = await import("@/test-utils/jar-ledger-fixtures");
  const seeded = new WeakMap<JarConfig, JarConfig>();
  const migrated = (cfg: JarConfig) => {
    if (!seeded.has(cfg)) seeded.set(cfg, withSeedDeposits(cfg, monthAnchor("2026-09")));
    return seeded.get(cfg)!;
  };
  return { useJarConfig: () => ({ config: migrated(h.jarConfig), loaded: h.jarsLoaded }) };
});
vi.mock("@/state/useFinancials", () => ({
  useFinancials: () => ({
    loading: false,
    error: false,
    transactions: h.transactions,
    raw: h.financialsLoaded ? { accounts: h.accounts } : null,
    financials: h.financialsLoaded ? {} : null,
  }),
}));
// Compose only READS through useAutoFund (snapshot/assessment); it never writes a
// manual txn, so the store's write side is inert here.
vi.mock("@/state/manual-txns", async (importActual) => ({
  ...(await importActual<typeof import("@/state/manual-txns")>()),
  useManualTxns: () => ({ add: vi.fn(), remove: vi.fn(), removeByTrigger: vi.fn(), addPersisted: vi.fn() }),
}));

import { TransferCompose } from "./TransferCompose";

beforeEach(() => {
  h.accounts = [casa(20_000_000)];
  h.transactions = [];
  h.jarConfig = { version: 3, jars: [] };
  h.jarsLoaded = false;
  h.financialsLoaded = false;
  push.mockClear();
  putDraft.mockClear();
});

describe("TransferCompose", () => {
  it("hands a validated saved recipient to mock confirmation without an account number", async () => {
    render(<TransferCompose />);
    fireEvent.click(await screen.findByRole("button", { name: /Lan Anh/ }));
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "10000000" } });
    const continueButton = screen.getByRole("button", { name: /Tiếp tục/ });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    expect(putDraft).toHaveBeenCalledWith(expect.objectContaining({ name: "Lan Anh", accountMasked: "****6677", riskFlags: ["over_threshold"], recipientSource: "saved_beneficiary", source: "mock" }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/transfer-confirm\?draftId=form_\d+&from=transfer$/));
  });

  it("routes the 'Tài khoản/Số thẻ' quick action through bank entry into the amount step", async () => {
    render(<TransferCompose />);
    fireEvent.click(await screen.findByRole("button", { name: "Tài khoản/Số thẻ" }));
    fireEvent.click(screen.getByRole("button", { name: "Ngân hàng nhận" }));
    fireEvent.click(screen.getByRole("button", { name: "Vietcombank" }));
    fireEvent.change(screen.getByPlaceholderText("Nhập số tài khoản/số thẻ"), { target: { value: "19012345678901" } });
    fireEvent.change(screen.getByPlaceholderText("Nhập tên người nhận"), { target: { value: "Nguyen Van A" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

    expect(await screen.findByLabelText("Số tiền")).toBeInTheDocument();
    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText(/Vietcombank/)).toBeInTheDocument();
  });

  it("returns to the account-picker step when navigating back from bank entry", async () => {
    render(<TransferCompose />);
    fireEvent.click(await screen.findByRole("button", { name: "Tài khoản/Số thẻ" }));
    expect(screen.getByRole("button", { name: "Ngân hàng nhận" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "‹ Quay lại" }));
    expect(await screen.findByRole("button", { name: "Tài khoản/Số thẻ" })).toBeInTheDocument();
  });

  it("lets the user change the recipient from the amount step, returning to the account picker", async () => {
    render(<TransferCompose />);
    fireEvent.click(await screen.findByRole("button", { name: /Lan Anh/ }));
    expect(await screen.findByLabelText("Số tiền")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Đổi" }));
    expect(await screen.findByRole("button", { name: "Tài khoản/Số thẻ" })).toBeInTheDocument();
  });

  it("shows the QR header icon on the pick step, and switches to a working Home icon on later steps", async () => {
    render(<TransferCompose />);
    expect(await screen.findByRole("button", { name: "Quét QR" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Về trang chủ" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Lan Anh/ }));
    const homeButton = await screen.findByRole("button", { name: "Về trang chủ" });
    expect(screen.queryByRole("button", { name: "Quét QR" })).not.toBeInTheDocument();

    fireEvent.click(homeButton);
    expect(push).toHaveBeenCalledWith("/");
  });
});

/** Picks Lan Anh, opens the source sheet and selects a jar row by label. */
async function pickJarSource(label: RegExp) {
  render(<TransferCompose />);
  fireEvent.click(await screen.findByRole("button", { name: /Lan Anh/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Tài khoản nguồn" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.click(within(sheet).getByRole("button", { name: label }));
}

function spend(amount: number, categoryId: string, postedAt: string): Transaction {
  return { id: `t_${categoryId}_${amount}`, accountId: "current", postedAt, amount, currency: "VND", direction: "debit", type: "expense", merchantName: "Chi", merchantNormalizedName: "chi", categoryId, status: "posted", source: "mock", isRecurring: false } as Transaction;
}

describe("TransferCompose — jar funding verdicts", () => {
  beforeEach(() => {
    h.jarsLoaded = true;
    h.financialsLoaded = true;
    h.accounts = [casa(6_000_000)]; // = food 1M + Du lịch 5M → pool 0
    h.jarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 1_000_000 },
        { id: "goal", label: "Du lịch", categoryIds: ["travel"], budgetLimit: 5_000_000 },
      ],
    };
  });
  afterEach(() => vi.useRealTimers());

  it("a shortfall another jar can cover opens the top-up popup with that jar as donor", async () => {
    await pickJarSource(/Ăn uống/);
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "3000000" } });
    const continueButton = await screen.findByRole("button", { name: /Tiếp tục/ });
    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(screen.queryByText("Không đủ số dư để chuyển số tiền này.")).not.toBeInTheDocument();
    fireEvent.click(continueButton);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/còn thiếu 2\.000\.000/)).toBeInTheDocument();
    expect(within(sheet).getByText("Hũ Du lịch")).toBeInTheDocument();
  });

  it("still blocks a true shortfall (above CASA) with 'Không đủ số dư'", async () => {
    await pickJarSource(/Ăn uống/);
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "7000000" } });
    expect(await screen.findByText("Không đủ số dư để chuyển số tiền này.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tiếp tục/ })).toBeDisabled();
  });

  it("S10/U7: assesses on the transfer clock's (demo) month even when the real clock is in October", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T03:00:00.000Z"));
    // September drained the food jar; an October view would show it full again.
    h.transactions = [spend(1_000_000, "dining", "2026-09-10T03:00:00.000Z")];
    h.accounts = [casa(5_000_000)]; // the spend left CASA → pool stays 0
    await pickJarSource(/Ăn uống/);
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "500000" } });
    const continueButton = await screen.findByRole("button", { name: /Tiếp tục/ });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    // September's drained jar → short by the full 500k (an October view would be `ok`).
    expect(within(await screen.findByRole("dialog")).getByText(/còn thiếu 500\.000/)).toBeInTheDocument();
  });

  it("shows the pool as 'Chưa rõ' (never a fabricated 0) when there is no CASA account", async () => {
    h.accounts = [];
    render(<TransferCompose />);
    fireEvent.click(await screen.findByRole("button", { name: /Lan Anh/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Tài khoản nguồn" }));
    const sheet = await screen.findByRole("dialog");
    const poolRow = within(sheet).getByRole("button", { name: /Chưa phân bổ/ });
    expect(poolRow).toBeDisabled();
    expect(within(poolRow).getByText("Chưa rõ")).toBeInTheDocument();
  });
});
