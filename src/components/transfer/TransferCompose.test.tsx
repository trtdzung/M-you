import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { push, putDraft, providers } = vi.hoisted(() => ({
  push: vi.fn(),
  putDraft: vi.fn(),
  providers: {
    listBeneficiaries: async () => [{ id: "b1", name: "Lan Anh", accountNumber: "0281000556677", bankName: "MSB", source: "mock" }],
    listTransactions: async () => [],
    listAccounts: async () => [{ id: "current", type: "current", institution: "MSB", currency: "VND", balance: 20_000_000, availableBalance: 20_000_000, lastSyncedAt: "2026-01-01", source: "mock", maskedNumber: "•••• 1991", accountNumber: "19881988181991" }],
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/transfer-draft-store", () => ({ putTransferDraft: putDraft }));
vi.mock("@/providers/context", () => ({
  useProviders: () => providers,
}));
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config: { version: 3, jars: [] } }) }));
vi.mock("@/state/useFinancials", () => ({ useFinancials: () => ({ loading: false, error: false, financials: null }) }));

import { TransferCompose } from "./TransferCompose";

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
