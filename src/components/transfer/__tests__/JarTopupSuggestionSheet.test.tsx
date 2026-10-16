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
  goalDonors: [],
  requiresManualGoal: false,
  targetJarId: "food",
  source: "mock",
};

function renderSheet(overrides: Partial<Parameters<typeof JarTopupSuggestionSheet>[0]> = {}) {
  const onAccept = vi.fn();
  const onChooseAnother = vi.fn();
  const onClose = vi.fn();
  render(
    <JarTopupSuggestionSheet
      assessment={assessment}
      targetLabel="Hũ Ăn uống"
      onAccept={onAccept}
      onChooseAnother={onChooseAnother}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onAccept, onChooseAnother, onClose };
}

describe("JarTopupSuggestionSheet", () => {
  it("renders the shortfall, target label, and every donor's take", () => {
    renderSheet();
    expect(screen.getByText(/Hũ Ăn uống còn thiếu/)).toBeInTheDocument();
    expect(screen.getByText("Chưa phân bổ")).toBeInTheDocument();
    expect(screen.getByText("Hũ Hưởng thụ")).toBeInTheDocument();
  });

  it("calls onAccept when 'Đồng ý rót' is tapped", () => {
    const { onAccept, onChooseAnother } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /Đồng ý rót/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onChooseAnother).not.toHaveBeenCalled();
  });

  it("calls onChooseAnother when 'Chọn nguồn khác' is tapped", () => {
    const { onChooseAnother } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Chọn nguồn khác" }));
    expect(onChooseAnother).toHaveBeenCalledTimes(1);
  });

  it("offers NO 'vượt hũ' escape hatch (plan 260918-1120)", () => {
    renderSheet();
    expect(screen.queryByRole("button", { name: /vượt hũ/i })).not.toBeInTheDocument();
  });

  it("double-tap guard: a second synchronous tap on the same button does not fire twice, and both buttons disable", () => {
    const { onAccept } = renderSheet();
    const acceptBtn = screen.getByRole("button", { name: /Đồng ý rót/ });
    const chooseBtn = screen.getByRole("button", { name: "Chọn nguồn khác" });

    fireEvent.click(acceptBtn);
    fireEvent.click(acceptBtn);

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(acceptBtn).toBeDisabled();
    expect(chooseBtn).toBeDisabled();
  });

  it("double-tap guard also blocks a second tap on a DIFFERENT button once latched", () => {
    const { onAccept, onChooseAnother } = renderSheet();
    const acceptBtn = screen.getByRole("button", { name: /Đồng ý rót/ });
    const chooseBtn = screen.getByRole("button", { name: "Chọn nguồn khác" });

    fireEvent.click(acceptBtn);
    fireEvent.click(chooseBtn);

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onChooseAnother).not.toHaveBeenCalled();
  });
});
