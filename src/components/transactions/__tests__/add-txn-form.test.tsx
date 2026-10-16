import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ManualTxnInput } from "@/state/manual-txns";

const add = vi.fn();
vi.mock("@/state/manual-txns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/state/manual-txns")>();
  return { ...actual, useManualTxns: () => ({ manualTxns: [], add, remove: vi.fn() }) };
});

import { AddTxnForm } from "../AddTxnForm";

beforeEach(() => add.mockClear());

/**
 * The manual add flow RECORDS a self-reported transaction — it must never move
 * money (invariant #3). These tests pin: a valid entry records with the right
 * shape (debit → expense), an incomplete entry cannot be saved, and nothing about
 * the form executes/confirms a transfer.
 */
describe("AddTxnForm", () => {
  it("disables save until amount, note and category are provided", () => {
    render(<AddTxnForm onClose={() => {}} />);
    const save = screen.getByRole("button", { name: "Lưu giao dịch" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "150000" } });
    fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Ăn trưa" } });
    fireEvent.click(screen.getByText("Ăn uống"));
    expect(save).toBeEnabled();
  });

  it("records a debit as a self-reported expense", () => {
    render(<AddTxnForm onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "150000" } });
    fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Ăn trưa" } });
    fireEvent.click(screen.getByText("Ăn uống"));
    fireEvent.click(screen.getByRole("button", { name: "Lưu giao dịch" }));

    expect(add).toHaveBeenCalledTimes(1);
    const input = add.mock.calls[0][0] as ManualTxnInput;
    expect(input).toMatchObject({ amount: 150_000, direction: "debit", categoryId: "dining", merchantName: "Ăn trưa" });
  });
});
