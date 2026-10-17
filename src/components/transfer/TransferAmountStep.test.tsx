import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Account, Jar } from "@/domain/models";
import { TransferAmountStep } from "./TransferAmountStep";
import type { SelectedRecipient } from "./RecipientPicker";

const current: Account = {
  id: "current", type: "current", institution: "MSB", currency: "VND", balance: 123_456_789,
  availableBalance: 123_456_789, lastSyncedAt: "2026-01-01", source: "mock", maskedNumber: "•••• 1991", accountNumber: "19881988191991",
};
const savings: Account = {
  id: "savings", type: "savings", institution: "MSB", currency: "VND", balance: 50_000_000,
  availableBalance: 50_000_000, lastSyncedAt: "2026-01-01", source: "mock", maskedNumber: "•••• 2003", accountNumber: "19881988192003",
};
const recipient: SelectedRecipient = { name: "Nguyen Van A", accountMasked: "****6677", accountNumber: "0281000556677", source: "saved_beneficiary", isNewPayee: false, bankName: "MSB" };

type PickerJar = Jar & { remaining: number | null; spendable: number | null };
const jarWithLimit: PickerJar = { id: "j1", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 3_000_000, remaining: 1_210_000, spendable: 1_210_000 };
const jarNoLimit: PickerJar = { id: "j2", label: "Giải trí", categoryIds: ["entertainment"], remaining: null, spendable: null };

function renderStep(overrides: Partial<Parameters<typeof TransferAmountStep>[0]> = {}) {
  const onChangeRecipient = vi.fn();
  const onSourceChange = vi.fn();
  const onAmountChange = vi.fn();
  const onMemoChange = vi.fn();
  const onContinue = vi.fn();
  const view = render(
    <TransferAmountStep
      recipient={recipient}
      accounts={[current, savings]}
      source={{ kind: "account", id: "current" }}
      amount=""
      memo=""
      canContinue={false}
      onChangeRecipient={onChangeRecipient}
      onSourceChange={onSourceChange}
      onAmountChange={onAmountChange}
      onMemoChange={onMemoChange}
      onContinue={onContinue}
      {...overrides}
    />,
  );
  return { onChangeRecipient, onSourceChange, onAmountChange, onMemoChange, onContinue, container: view.container };
}

describe("TransferAmountStep", () => {
  it("shows the chosen recipient with its full (unmasked) account number and lets the user change it", () => {
    const { onChangeRecipient } = renderStep();
    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText("0281000556677")).toBeInTheDocument();
    expect(screen.queryByText("****6677")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đổi" }));
    expect(onChangeRecipient).toHaveBeenCalledTimes(1);
  });

  it("displays the amount grouped as 1.000.000 but reports raw digits upward", () => {
    const { onAmountChange } = renderStep({ amount: "11111111111111" });
    const input = screen.getByLabelText(/Số tiền/);
    expect(input).toHaveValue("11.111.111.111.111");
    fireEvent.change(input, { target: { value: "1.000.0005" } });
    expect(onAmountChange).toHaveBeenCalledWith("10000005");
  });

  it("shows the recipient's real bank logo and bank name when known and distinct from the display name", () => {
    renderStep();
    expect(document.querySelector('img[src="/logos/MSB.png"]')).toBeInTheDocument();
    expect(screen.getByText(/^MSB ·$/)).toBeInTheDocument();
  });

  it("shows the logo but no redundant bank-name line when the recipient's name IS the bank (typed via bank entry)", () => {
    renderStep({
      recipient: { name: "Vietcombank", accountMasked: "****8901", accountNumber: "19012345678901", source: "user_typed", isNewPayee: true, bankName: "Vietcombank" },
    });
    expect(document.querySelector('img[src="/logos/Vietcom.png"]')).toBeInTheDocument();
    expect(screen.queryByText(/^Vietcombank ·$/)).not.toBeInTheDocument();
  });

  it("falls back to an initials avatar with no bank-name line when the recipient's bank is unknown", () => {
    renderStep({ recipient: { name: "Ai đó", accountMasked: "****0000", accountNumber: "00000000000000", source: "transaction_history", isNewPayee: true } });
    expect(document.querySelectorAll("img").length).toBe(0);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows the selected source account with its balance", () => {
    renderStep();
    expect(screen.getByText("123.456.789 ₫")).toBeInTheDocument();
  });

  it("shows the full (unmasked) account number for the source account, in the field and the sheet — no logo added there (only the recipient has one)", () => {
    renderStep();
    expect(document.querySelectorAll("img").length).toBe(1); // the recipient's logo only
    expect(screen.getByText(/19881988191991/)).toBeInTheDocument();
    expect(screen.queryByText(/•••• 1991/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tài khoản nguồn" }));
    expect(document.querySelectorAll("img").length).toBe(1);
    expect(screen.getByText(/19881988192003/)).toBeInTheDocument();
  });

  it("opens a sheet to switch the source account", () => {
    const { onSourceChange } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Tài khoản nguồn" }));
    fireEvent.click(screen.getByRole("button", { name: /2003/ }));
    expect(onSourceChange).toHaveBeenCalledWith({ kind: "account", id: "savings" });
  });

  it("marks the current (Tài khoản thanh toán) account as Mặc định in the source-account sheet, keeping it first", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Tài khoản nguồn" }));
    const dialog = screen.getByRole("dialog");
    const rows = within(dialog).getAllByRole("button", { name: /Tài khoản (thanh toán|tiết kiệm)/ });
    expect(rows[0]).toHaveTextContent("Tài khoản thanh toán");
    expect(rows[0]).toHaveTextContent("Mặc định");
    expect(rows[1]).not.toHaveTextContent("Mặc định");
  });

  it("lists jars below the accounts; a jar with a limit is selectable (shows còn lại), one with no limit stays non-selectable", () => {
    const { onSourceChange } = renderStep({ jars: [jarWithLimit, jarNoLimit] });
    fireEvent.click(screen.getByRole("button", { name: "Tài khoản nguồn" }));

    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByText("Giải trí")).toBeInTheDocument();
    // The no-limit jar shows "Chưa có số dư"; the funded one shows its còn lại.
    expect(screen.getAllByText("Chưa có số dư")).toHaveLength(1);
    expect(screen.getByText("1.210.000 ₫")).toBeInTheDocument();

    // The no-limit jar is not a button; tapping its label does nothing.
    fireEvent.click(screen.getByText("Giải trí"));
    expect(onSourceChange).not.toHaveBeenCalled();
    // The funded jar is selectable.
    fireEvent.click(screen.getByText("Ăn uống"));
    expect(onSourceChange).toHaveBeenCalledWith({ kind: "jar", id: "j1" });
  });

  it("a jar with a set limit shows its derived còn lại (= max(0, remaining)), no spending-limit wording, and is selectable", () => {
    const funded: PickerJar = {
      id: "j3", label: "Thiết yếu", categoryIds: ["housing"], budgetLimit: 8_000_000, remaining: 8_000_000, spendable: 8_000_000,
    };
    const { onSourceChange } = renderStep({ jars: [funded] });
    fireEvent.click(screen.getByRole("button", { name: "Tài khoản nguồn" }));

    // The còn lại is shown; the "đã set"/limit wording is gone.
    expect(screen.getByText("8.000.000 ₫")).toBeInTheDocument();
    expect(screen.queryByText(/Đã set/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Thiết yếu"));
    expect(onSourceChange).toHaveBeenCalledWith({ kind: "jar", id: "j3" });
  });

  it("reports amount and memo changes", () => {
    const { onAmountChange, onMemoChange } = renderStep();
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "1000000" } });
    expect(onAmountChange).toHaveBeenCalledWith("1000000");
    fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "an trua" } });
    expect(onMemoChange).toHaveBeenCalledWith("an trua");
  });

  it("shows a decorative schedule toggle that does not affect continue", () => {
    renderStep();
    const toggle = screen.getByRole("switch", { name: "Đặt lịch chuyển tiền" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("disables continue until canContinue is true, then calls onContinue", () => {
    const { onContinue, rerender } = (() => {
      const onChangeRecipient = vi.fn();
      const onSourceChange = vi.fn();
      const onAmountChange = vi.fn();
      const onMemoChange = vi.fn();
      const onContinue = vi.fn();
      const view = render(
        <TransferAmountStep
          recipient={recipient}
          accounts={[current]}
          source={{ kind: "account", id: "current" }}
          amount=""
          memo=""
          canContinue={false}
          onChangeRecipient={onChangeRecipient}
          onSourceChange={onSourceChange}
          onAmountChange={onAmountChange}
          onMemoChange={onMemoChange}
          onContinue={onContinue}
        />,
      );
      return { onContinue, rerender: view.rerender };
    })();
    expect(screen.getByRole("button", { name: /Tiếp tục/ })).toBeDisabled();

    rerender(
      <TransferAmountStep
        recipient={recipient}
        accounts={[current]}
        source={{ kind: "account", id: "current" }}
        amount="1000000"
        memo=""
        canContinue
        onChangeRecipient={vi.fn()}
        onSourceChange={vi.fn()}
        onAmountChange={vi.fn()}
        onMemoChange={vi.fn()}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Tiếp tục/ }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("does not show any disclaimer or risk-warning copy — the reference mockup has none", () => {
    renderStep();
    expect(screen.queryByText(/Bước này chỉ tạo bản nháp/)).not.toBeInTheDocument();
    expect(screen.queryByText("Cần kiểm tra kỹ")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
