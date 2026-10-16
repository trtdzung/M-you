import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TransferAccountPicker } from "./TransferAccountPicker";
import type { Transaction } from "@/domain/models";

function renderPicker(overrides: Partial<Parameters<typeof TransferAccountPicker>[0]> = {}) {
  const onSelectRecipient = vi.fn();
  const onEnterBankDetails = vi.fn();
  const onAddRecipient = vi.fn();
  const view = render(
    <TransferAccountPicker
      beneficiaries={[]}
      transactions={[]}
      onSelectRecipient={onSelectRecipient}
      onEnterBankDetails={onEnterBankDetails}
      onAddRecipient={onAddRecipient}
      {...overrides}
    />,
  );
  return { onSelectRecipient, onEnterBankDetails, onAddRecipient, container: view.container };
}

const recentTransferTxn: Transaction = {
  id: "t1",
  accountId: "current",
  postedAt: "2026-09-08T00:00:00.000Z",
  amount: 3_000_000,
  currency: "VND",
  direction: "debit",
  type: "transfer",
  merchantName: "Phạm Thu Hà",
  merchantNormalizedName: "pham thu ha",
  categoryId: "transfer",
  status: "posted",
  source: "mock",
  isRecurring: false,
  userEdited: false,
  counterpartyAccountNumber: "0281000556677",
  counterpartyBankName: "Techcombank",
};

describe("TransferAccountPicker", () => {
  it("opens the external-bank step when 'Tài khoản/Số thẻ' is tapped", () => {
    const { onEnterBankDetails } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Tài khoản/Số thẻ" }));
    expect(onEnterBankDetails).toHaveBeenCalledTimes(1);
  });

  it("does not show 'Mẫu chuyển tiền' — replaced by 'Quản lý lệnh chuyển tiền' in the quick-action row", () => {
    renderPicker();
    expect(screen.queryByText("Mẫu chuyển tiền")).not.toBeInTheDocument();
  });

  it("shows 'Quản lý lệnh chuyển tiền' as decorative text, not a dead button", () => {
    renderPicker();
    expect(screen.getByText("Quản lý lệnh chuyển tiền")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quản lý lệnh chuyển tiền" })).not.toBeInTheDocument();
  });

  it("selecting a saved recipient calls onSelectRecipient", () => {
    const { onSelectRecipient } = renderPicker({
      beneficiaries: [{ id: "b1", name: "Nguyễn Thị Lan", accountNumber: "19012345678901", bankName: "MSB", source: "mock" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /Nguyễn Thị Lan/ }));
    expect(onSelectRecipient).toHaveBeenCalledTimes(1);
    expect(onSelectRecipient.mock.calls[0][0]).toMatchObject({ name: "Nguyễn Thị Lan", source: "saved_beneficiary" });
  });

  it("shows the real bank logo, bank name, and full (unmasked) account number for a saved beneficiary", () => {
    const { container } = renderPicker({
      beneficiaries: [{ id: "b1", name: "Nguyễn Thị Lan", accountNumber: "19012345678901", bankName: "MSB", source: "mock" }],
    });
    expect(container.querySelector('img[src="/logos/MSB.png"]')).toBeInTheDocument();
    expect(screen.getByText(/^MSB ·$/)).toBeInTheDocument();
    expect(screen.getByText("19012345678901")).toBeInTheDocument();
    expect(screen.queryByText("****8901")).not.toBeInTheDocument();
  });

  it("shows the real bank logo and full account number for a recent (transaction-history) recipient too", () => {
    const { container } = renderPicker({ transactions: [recentTransferTxn] });
    fireEvent.click(screen.getByRole("tab", { name: "Gần đây" }));
    expect(container.querySelector('img[src="/logos/Techcom.png"]')).toBeInTheDocument();
    expect(screen.getByText("0281000556677")).toBeInTheDocument();
  });

  it("falls back to an initials avatar when a recipient's bank has no logo asset on record", () => {
    const { container } = renderPicker({
      beneficiaries: [{ id: "b2", name: "Công ty CP Đầu tư An Phú", accountNumber: "0331000445566", bankName: "Ngân hàng lạ", source: "mock" }],
    });
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("0331000445566")).toBeInTheDocument();
  });
});
