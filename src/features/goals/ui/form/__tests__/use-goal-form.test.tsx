import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavingsGoal } from "../../../model/types";
import { GoalForm } from "../GoalForm";
import { useGoalForm } from "../use-goal-form";

vi.mock("@/lib/demo-clock", () => ({
  transferNow: () => new Date("2026-09-15T00:00:00.000Z"),
}));

const saved: SavingsGoal = {
  id: "goal_1",
  name: "Mua nhà",
  targetAmount: 600_000_000,
  targetDate: "2029-09-15",
  flexibility: "fixed",
  monthlyContribution: 2_000_000,
  status: "active",
  jarId: null,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  source: "self_reported",
};

describe("useGoalForm", () => {
  it("validates a create input and merges a money parse error onto the field", () => {
    const { result } = renderHook(() => useGoalForm());
    expect(result.current.mode).toBe("create");

    let invalid: unknown = "not-checked";
    act(() => {
      invalid = result.current.validate();
    });
    expect(invalid).toBeNull();
    expect(result.current.errors.name).toBe("Tên mục tiêu từ 1 đến 80 ký tự");

    act(() => {
      result.current.set("name", "Mua nhà");
      result.current.set("targetAmount", "abc");
      result.current.set("targetDate", "2029-09-15");
    });
    act(() => {
      invalid = result.current.validate();
    });
    expect(invalid).toBeNull();
    expect(result.current.errors.targetAmount).toBe("Chỉ nhập số tiền, vd 5.000.000");

    act(() => result.current.set("targetAmount", "600000000"));
    let created: unknown;
    act(() => {
      created = result.current.validate();
    });
    expect(created).toEqual({
      name: "Mua nhà",
      targetAmount: 600_000_000,
      targetDate: "2029-09-15",
      flexibility: "flexible",
      monthlyContribution: null,
      openingAmount: null,
    });
  });

  it("hides openingAmount in update mode and validates the saved fields", () => {
    const { result } = renderHook(() => useGoalForm(saved));
    expect(result.current.mode).toBe("update");
    expect(result.current.values.openingAmount).toBe("");
    let updated: unknown;
    act(() => {
      updated = result.current.validate();
    });
    expect(updated).toEqual({
      name: "Mua nhà",
      targetAmount: 600_000_000,
      targetDate: "2029-09-15",
      flexibility: "fixed",
      monthlyContribution: 2_000_000,
    });
    expect(updated).not.toHaveProperty("openingAmount");
  });

  it("applies extend_date and reduce_amount, and leaves the form unchanged for cut_category", () => {
    const { result } = renderHook(() => useGoalForm());
    act(() => {
      result.current.set("name", "Mua nhà");
      result.current.set("targetAmount", "600000000");
      result.current.set("targetDate", "2029-09-15");
    });
    const before = result.current.values;

    let applied = true;
    act(() => {
      applied = result.current.applyLever({
        kind: "cut_category",
        categoryId: "food",
        cutPerMonth: 4_666_667,
        enough: true,
      });
    });
    expect(applied).toBe(false);
    expect(result.current.values).toEqual(before);

    act(() => {
      applied = result.current.applyLever({
        kind: "extend_date",
        newDate: "2030-11-15",
        months: 50,
      });
    });
    expect(applied).toBe(true);
    expect(result.current.values.targetDate).toBe("2030-11-15");

    act(() => {
      applied = result.current.applyLever({ kind: "reduce_amount", newTarget: 432_000_000 });
    });
    expect(applied).toBe(true);
    expect(result.current.values.targetAmount).toBe("432000000");
  });
});

function Fields({ initial }: { initial?: SavingsGoal }) {
  const form = useGoalForm(initial);
  return (
    <>
      <GoalForm form={form} />
      <button type="button" onClick={() => form.validate()}>
        Kiểm tra
      </button>
    </>
  );
}

describe("GoalForm fields", () => {
  it("shows a field error on the empty create form", () => {
    render(<Fields />);
    expect(screen.getByLabelText("Số đã có sẵn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    expect(screen.getByText("Tên mục tiêu từ 1 đến 80 ký tự")).toBeInTheDocument();
  });

  it("hides the opening amount when editing an existing goal", () => {
    render(<Fields initial={saved} />);
    expect(screen.queryByLabelText("Số đã có sẵn")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tên mục tiêu")).toHaveValue("Mua nhà");
  });
});
