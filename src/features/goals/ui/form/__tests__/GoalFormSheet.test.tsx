import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalFormSheet } from "../GoalFormSheet";
import { useGoalForm } from "../use-goal-form";

vi.mock("@/lib/demo-clock", () => ({
  transferNow: () => new Date("2026-09-15T00:00:00.000Z"),
}));

function Harness({ pending, onSubmit }: { pending: boolean; onSubmit: (input: unknown) => void }) {
  const form = useGoalForm();
  return <GoalFormSheet form={form} pending={pending} onSubmit={onSubmit} onClose={vi.fn()} />;
}

describe("GoalFormSheet", () => {
  it("disables the save button while a write is pending", async () => {
    render(<Harness pending onSubmit={vi.fn()} />);
    const save = await screen.findByRole("button", { name: "Đang lưu…" });
    expect(save).toBeDisabled();
  });

  it("submits the validated create input", async () => {
    const onSubmit = vi.fn();
    render(<Harness pending={false} onSubmit={onSubmit} />);
    expect(await screen.findByRole("dialog", { name: "Tạo mục tiêu" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tên mục tiêu"), { target: { value: "Mua nhà" } });
    fireEvent.change(screen.getByLabelText("Số tiền mục tiêu"), { target: { value: "600000000" } });
    fireEvent.change(screen.getByLabelText("Ngày hoàn thành"), { target: { value: "2029-09-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Mua nhà",
      targetAmount: 600_000_000,
      targetDate: "2029-09-15",
      flexibility: "flexible",
      monthlyContribution: null,
      openingAmount: null,
    });
  });
});
