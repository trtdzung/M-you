import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TransferBankEntry } from "./TransferBankEntry";

function renderEntry() {
  const onContinue = vi.fn();
  render(<TransferBankEntry onContinue={onContinue} beneficiaries={[]} transactions={[]} />);
  return { onContinue };
}

function pickBank(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name: "Ngân hàng nhận" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("TransferBankEntry", () => {
  it("allows an existing saved payee without applying manual-entry number constraints", () => {
    const onContinue = vi.fn();
    render(<TransferBankEntry onContinue={onContinue} transactions={[]} beneficiaries={[{ id: "saved", name: "Saved Payee", accountNumber: "VJTP024E150410260IL", bankName: "Vietcombank", source: "mock" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn người nhận đã lưu hoặc gần đây" }));
    fireEvent.click(screen.getByRole("button", { name: /Saved Payee Vietcombank/ }));
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ accountNumber: "VJTP024E150410260IL", source: "saved_beneficiary" }));
  });

  it("filters banks by their full Vietnamese name and keeps the selection flow", () => {
    renderEntry();
    fireEvent.click(screen.getByRole("button", { name: "Ngân hàng nhận" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tên ngân hàng" }), { target: { value: "ngoai thuong" } });
    expect(screen.queryByRole("button", { name: "MSB", exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vietcombank", exact: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ngân hàng nhận" })).toHaveTextContent("Vietcombank");
  });

  it("only lists banks with a real logo — no branch step for any of them", () => {
    renderEntry();
    fireEvent.click(screen.getByRole("button", { name: "Ngân hàng nhận" }));
    expect(screen.getByRole("button", { name: /Vietcombank/ })).toBeInTheDocument();
    expect(screen.queryByText("NHNN Việt Nam")).not.toBeInTheDocument();
  });

  it("selecting a bank and a valid account number enables Tiếp tục and reports the recipient", () => {
    const { onContinue } = renderEntry();
    pickBank(/Vietcombank/);
    expect(screen.queryByRole("button", { name: "Chọn chi nhánh" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Nhập số tài khoản/số thẻ"), { target: { value: "19012345678901" } });
    fireEvent.change(screen.getByPlaceholderText("Nhập tên người nhận"), { target: { value: "Nguyen Van A" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue.mock.calls[0][0]).toMatchObject({ name: "Nguyen Van A", bankName: "Vietcombank", isNewPayee: true, source: "user_typed" });
  });

  it("keeps Tiếp tục disabled for an invalid account number", () => {
    renderEntry();
    pickBank(/Vietcombank/);
    fireEvent.change(screen.getByPlaceholderText("Nhập số tài khoản/số thẻ"), { target: { value: "123" } });
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled();
  });
});
