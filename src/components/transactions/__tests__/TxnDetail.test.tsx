import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Transaction } from "@/domain/models";
import type { Corrections } from "@/state/corrections";

/**
 * TxnDetail is a leaf presentational component: it receives a `txn` prop (in the
 * app, sourced from the provider via `PfmTxnList`/`useFinancials`) and reads/
 * writes ONLY through the corrections seam — it never mutates the provider
 * record (invariant #4). Mocking `useCorrections` here (same pattern as
 * `add-txn-form.test.tsx`) lets us assert the exact calls it makes without
 * re-driving the whole provider stack for a component that owns no data of
 * its own.
 */
let correctionsState: Corrections = {};
const setCategory = vi.fn();
const setHidden = vi.fn();
const clearCategory = vi.fn();

vi.mock("@/state/corrections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/state/corrections")>();
  return {
    ...actual,
    useCorrections: () => ({
      corrections: correctionsState,
      setCategory,
      setHidden,
      clearCategory,
      reset: vi.fn(),
    }),
  };
});

import { TxnDetail } from "../TxnDetail";

const TXN: Transaction = {
  id: "tx_1",
  accountId: "acc_current",
  postedAt: "2026-09-05T10:00:00.000Z",
  amount: 150_000,
  currency: "VND",
  direction: "debit",
  type: "expense",
  merchantName: "Highlands Coffee",
  merchantNormalizedName: "highlands",
  categoryId: "dining",
  status: "posted",
  source: "mock",
  isRecurring: false,
  userEdited: false,
};

beforeEach(() => {
  correctionsState = {};
  setCategory.mockClear();
  setHidden.mockClear();
  clearCategory.mockClear();
});

describe("TxnDetail", () => {
  it("shows amount, type and Ngày/Trạng thái rows for the given transaction", () => {
    render(<TxnDetail txn={TXN} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Chi tiết giao dịch" })).toBeInTheDocument();
    expect(screen.getByText("Chi tiêu")).toBeInTheDocument(); // TYPE_LABEL.expense
    expect(screen.getByText("-150.000 ₫")).toBeInTheDocument(); // debit sign
    expect(screen.getByText("Ngày")).toBeInTheDocument();
    expect(screen.getByText("05/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Trạng thái")).toBeInTheDocument();
    expect(screen.getByText("Đã ghi nhận")).toBeInTheDocument(); // status "posted"
    expect(screen.getByText("Ăn uống")).toBeInTheDocument(); // current category label
  });

  it("changing category via the inline picker calls setCategory with the new id", () => {
    render(<TxnDetail txn={TXN} onClose={vi.fn()} />);

    // Opens the category grid.
    fireEvent.click(screen.getByRole("button", { name: /Đổi/ }));
    // Picks a different category (Di chuyển / transport).
    fireEvent.click(screen.getByRole("button", { name: /Di chuyển/ }));

    expect(setCategory).toHaveBeenCalledWith("tx_1", "transport");
    expect(setCategory).toHaveBeenCalledTimes(1);
  });

  it("the hidden toggle (role=switch) starts unchecked and flips setHidden(true) on click", () => {
    render(<TxnDetail txn={TXN} onClose={vi.fn()} />);

    const toggle = screen.getByRole("switch", { name: "Ẩn khỏi báo cáo" });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(setHidden).toHaveBeenCalledWith("tx_1", true);
  });

  it("the hidden toggle reflects an existing hidden correction and flips it off", () => {
    correctionsState = { tx_1: { hidden: true } };
    render(<TxnDetail txn={TXN} onClose={vi.fn()} />);

    const toggle = screen.getByRole("switch", { name: "Ẩn khỏi báo cáo" });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(setHidden).toHaveBeenCalledWith("tx_1", false);
  });

  it("shows 'Khôi phục gốc' only for a user-edited transaction and calls clearCategory", () => {
    const { rerender } = render(<TxnDetail txn={TXN} onClose={vi.fn()} />);
    expect(screen.queryByText("Khôi phục gốc")).toBeNull();

    const edited: Transaction = { ...TXN, userEdited: true };
    rerender(<TxnDetail txn={edited} onClose={vi.fn()} />);

    const restore = screen.getByText("Khôi phục gốc");
    fireEvent.click(restore);
    expect(clearCategory).toHaveBeenCalledWith("tx_1");
  });

  it("calls onClose when the sheet's close button is activated", () => {
    const onClose = vi.fn();
    render(<TxnDetail txn={TXN} onClose={onClose} />);

    fireEvent.click(screen.getAllByLabelText("Đóng")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
