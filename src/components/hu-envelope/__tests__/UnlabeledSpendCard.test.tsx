import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnlabeledSpendCard } from "../UnlabeledSpendCard";

describe("UnlabeledSpendCard", () => {
  it("renders the title, transaction count, and compact amount", () => {
    render(<UnlabeledSpendCard count={3} amount={1_200_000} onOpen={() => {}} />);
    expect(screen.getByText("Chưa gắn nhãn")).toBeInTheDocument();
    expect(screen.getByText("3 giao dịch chưa vào hũ")).toBeInTheDocument();
    expect(screen.getByText("1,2 tr")).toBeInTheDocument();
  });

  it("invokes onOpen when the CTA is clicked", () => {
    const onOpen = vi.fn();
    render(<UnlabeledSpendCard count={1} amount={100_000} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Gắn nhãn/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders an empty state at count 0 (đã gắn nhãn hết) with a disabled CTA", () => {
    const onOpen = vi.fn();
    render(<UnlabeledSpendCard count={0} amount={0} onOpen={onOpen} />);
    expect(screen.getByText("Chưa gắn nhãn")).toBeInTheDocument();
    expect(screen.getByText("Đã gắn nhãn hết")).toBeInTheDocument();
    expect(screen.getByText("0 ₫")).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: /Gắn nhãn/ });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
