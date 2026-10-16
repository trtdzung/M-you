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
});
