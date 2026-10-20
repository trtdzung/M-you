import { describe, expect, it } from "vitest";
import { stateFromScenario } from "../../store/reducer";
import { CASHFLOW_NOTE_SHARE, isSaving, newGoalCashflowNote, requiredMonthly } from "../feasibility";

describe("newGoalCashflowNote: mục tiêu mới + số góp các mục tiêu đang diễn ra > 70% số dư hằng tháng", () => {
  const base = stateFromScenario("s01-car-feasible");
  const existing = base.goals.filter(isSaving).reduce((sum, g) => sum + requiredMonthly(base, g), 0);
  const withSurplus = (monthlySurplus: number | "unknown") => ({ ...base, customer: { ...base.customer, monthlySurplus } });

  it("có mục tiêu đang diễn ra để so", () => {
    expect(existing).toBeGreaterThan(0);
  });

  it("đúng ngưỡng 70% thì chưa cảnh báo, hơn một chút thì cảnh báo", () => {
    const surplus = 100_000_000;
    const room = surplus * CASHFLOW_NOTE_SHARE - existing;
    expect(newGoalCashflowNote(withSurplus(surplus), Math.floor(room))).toBeNull();
    const note = newGoalCashflowNote(withSurplus(surplus), Math.floor(room) + 1000);
    expect(note).toMatchObject({ existing, total: existing + Math.floor(room) + 1000, limit: 70_000_000, surplus });
  });

  it("không có lưu ý khi chưa biết số dư, chưa có số góp, hoặc chưa có mục tiêu nào đang diễn ra", () => {
    expect(newGoalCashflowNote(withSurplus("unknown"), 999_999_999)).toBeNull();
    expect(newGoalCashflowNote(withSurplus(1_000_000), 0)).toBeNull();
    expect(newGoalCashflowNote({ ...withSurplus(1_000_000), goals: [] }, 999_999_999)).toBeNull();
  });
});
