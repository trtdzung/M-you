import { render, screen, cleanup } from "@testing-library/react";
import { expect, it } from "vitest";
import { LedgerPreview } from "../LedgerPreview";
import type { SavingsGoalView } from "../../../model/types";
const goal = { name: "Mua xe", currentAmount: 2000000, targetAmount: 10000000, createdAt: "2026-01-01T00:00:00Z", targetDate: "2027-01-01" } as SavingsGoalView;
it("previews balance and progress after deposit and withdrawal", () => {
  render(<LedgerPreview goal={goal} amount={1000000} kind="deposit" />);
  expect(screen.getByText("3,000,000 VND")).toBeInTheDocument();
  expect(screen.getByText("30%")).toBeInTheDocument();
  cleanup();
  render(<LedgerPreview goal={goal} amount={1000000} kind="withdraw" />);
  expect(screen.getByText("1,000,000 VND")).toBeInTheDocument();
  expect(screen.getByText("10%")).toBeInTheDocument();
});
it("does not show a negative preview for an invalid withdrawal", () => {
  render(<LedgerPreview goal={goal} amount={3000000} kind="withdraw" />);
  expect(screen.queryByText("Sau khi rút")).not.toBeInTheDocument();
});
