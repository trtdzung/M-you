import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FundingAssessment } from "@/domain/engine";
import { JarTopupSuggestionSheet } from "../JarTopupSuggestionSheet";

/**
 * "Hũ thiếu tiền → gợi ý rót" popup — pure presentation of a `FundingAssessment`
 * (never computes money itself) plus the double-tap guard (RT#10, mirrors
 * `confirm()`'s `committedRef`): a synchronous second tap on ANY of the three
 * choice buttons must never fire a second callback.
 */

const assessment: FundingAssessment = {
  tier: "topup",
  shortfall: 500_000,
  donors: [
    { jarId: "pool", label: "Chưa phân bổ", take: 300_000 },
    { jarId: "lifestyle", label: "Hũ Hưởng thụ", take: 200_000 },
  ],
  targetJarId: "food",
  source: "mock",
};

function renderSheet(overrides: Partial<Parameters<typeof JarTopupSuggestionSheet>[0]> = {}) {
  const onAccept = vi.fn();
  const onOverspend = vi.fn();
  const onChooseAnother = vi.fn();
  const onClose = vi.fn();
  render(
    <JarTopupSuggestionSheet
      assessment={assessment}
      targetLabel="Hũ Ăn uống"
      onAccept={onAccept}
      onOverspend={onOverspend}
      onChooseAnother={onChooseAnother}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onAccept, onOverspend, onChooseAnother, onClose };
}

describe("JarTopupSuggestionSheet", () => {
  it("renders the shortfall, target label, and every donor's take", () => {
    renderSheet();
    expect(screen.getByText(/Hũ Ăn uống còn thiếu/)).toBeInTheDocument();
    expect(screen.getByText("Chưa phân bổ")).toBeInTheDocument();
    expect(screen.getByText("Hũ Hưởng thụ")).toBeInTheDocument();
  });

  it("calls onAccept when 'Đồng ý rót' is tapped", () => {
    const { onAccept, onChooseAnother, onOverspend } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /Đồng ý rót/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onChooseAnother).not.toHaveBeenCalled();
    expect(onOverspend).not.toHaveBeenCalled();
  });

  it("calls onChooseAnother when 'Chọn nguồn khác' is tapped", () => {
    const { onChooseAnother } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Chọn nguồn khác" }));
    expect(onChooseAnother).toHaveBeenCalledTimes(1);
  });

  it("calls onOverspend when 'Bỏ qua, vượt hũ' is tapped", () => {
    const { onOverspend } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua, vượt hũ" }));
    expect(onOverspend).toHaveBeenCalledTimes(1);
  });

  it("double-tap guard: a second synchronous tap on the same button does not fire twice, and all three buttons disable", () => {
    const { onAccept } = renderSheet();
    const acceptBtn = screen.getByRole("button", { name: /Đồng ý rót/ });
    const chooseBtn = screen.getByRole("button", { name: "Chọn nguồn khác" });
    const overspendBtn = screen.getByRole("button", { name: "Bỏ qua, vượt hũ" });

    fireEvent.click(acceptBtn);
    fireEvent.click(acceptBtn);

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(acceptBtn).toBeDisabled();
    expect(chooseBtn).toBeDisabled();
    expect(overspendBtn).toBeDisabled();
  });

  it("double-tap guard also blocks a second tap on a DIFFERENT button once latched", () => {
    const { onAccept, onOverspend } = renderSheet();
    const acceptBtn = screen.getByRole("button", { name: /Đồng ý rót/ });
    const overspendBtn = screen.getByRole("button", { name: "Bỏ qua, vượt hũ" });

    fireEvent.click(acceptBtn);
    fireEvent.click(overspendBtn);

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onOverspend).not.toHaveBeenCalled();
  });
});
