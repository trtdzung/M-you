import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalFormSheet } from "../GoalFormSheet";
import { useGoalForm } from "../use-goal-form";

vi.mock("@/lib/demo-clock", () => ({
  transferNow: () => new Date("2026-09-15T00:00:00.000Z"),
}));

function Harness({ pending, onSubmit, inline = false }: { pending: boolean; onSubmit: (input: unknown) => void; inline?: boolean }) {
  const form = useGoalForm();
  return <GoalFormSheet inline={inline} form={form} pending={pending} onSubmit={onSubmit} onClose={vi.fn()} />;
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
    fireEvent.click(screen.getByLabelText("Ngày hoàn thành"));
    fireEvent.click(await screen.findByRole("button", { name: "Chọn năm" }));
    fireEvent.click(screen.getByRole("button", { name: "2029" }));
    fireEvent.click(screen.getByRole("button", { name: "Tháng 9" }));
    fireEvent.click(screen.getByRole("button", { name: "15/09/2029" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn ngày này" }));
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
  it("formats money, shows supplementary fields inline, and confirms a date from the calendar", async () => {
    const onSubmit = vi.fn();
    render(<Harness inline pending={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Tên mục tiêu"), { target: { value: "Mua xe" } });
    fireEvent.change(screen.getByLabelText("Số tiền mục tiêu"), { target: { value: "600000000" } });
    expect(screen.getByLabelText("Số tiền mục tiêu")).toHaveValue("600,000,000");
    expect(screen.getByRole("heading", { name: "Kế hoạch tích lũy" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Thông tin bổ sung" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Số đã có sẵn"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByLabelText("Ngày hoàn thành"));
    expect(await screen.findByRole("dialog", { name: "Ngày hoàn thành" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15/09/2026" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Chọn năm" }));
    fireEvent.click(screen.getByRole("button", { name: "2029" }));
    fireEvent.click(screen.getByRole("button", { name: "Tháng 9" }));
    fireEvent.click(screen.getByRole("button", { name: "15/09/2029" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn ngày này" }));
    expect(screen.getByLabelText("Ngày hoàn thành")).toHaveTextContent("15/09/2029");
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ targetAmount: 600000000, openingAmount: 1000000, targetDate: "2029-09-15" }));
  });

  it("suggests appended zeros up to million, ten-million and hundred-million ranges", () => {
    render(<Harness inline pending={false} onSubmit={vi.fn()} />);
    const money = screen.getByLabelText("Số tiền mục tiêu");
    fireEvent.change(money, { target: { value: "100000" } });
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: "1,000,000 VND 1 triệu" })).toBeInTheDocument();
    fireEvent.change(money, { target: { value: "120000" } });
    fireEvent.click(screen.getByRole("option", { name: "120,000,000 VND 120 triệu" }));
    expect(money).toHaveValue("120,000,000");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.change(money, { target: { value: "123" } });
    expect(screen.getByRole("option", { name: "123,000,000 VND 123 triệu" })).toBeInTheDocument();
    fireEvent.keyDown(money, { key: "ArrowDown" });
    fireEvent.keyDown(money, { key: "Enter" });
    expect(money).toHaveValue("1,230,000");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

});
