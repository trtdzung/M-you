import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Analysis, Plan } from "../../../advisor/analysis-types";
import type { SavingsGoalView } from "../../../model/types";
import { SavedGoalAssessment } from "../SavedGoalAssessment";

const mocks = vi.hoisted(() => ({ advisor: vi.fn(), update: vi.fn(), narration: vi.fn() }));
vi.mock("../../../client/hooks/use-goal-advisor", () => ({ useGoalAdvisor: mocks.advisor }));
vi.mock("../../../client/hooks/use-advisor-narration", () => ({ useAdvisorNarration: mocks.narration }));
vi.mock("../../../client/hooks/use-goal-mutations", () => ({ useGoalMutations: () => ({ update: mocks.update, pending: false }) }));

const plan: Plan = { id: "keep_deadline", available: true, reason: null, needed: true, months: 10, monthly: 500_000, targetDate: "2027-09-15", targetAmount: 10_000_000, cuts: [], cutsCoverGap: true, fundingFromJars: [], fundingFromIdle: 4_000_000, series: [] };
const analysis: Analysis = { verdict: "feasible", requiredMonthly: 900_000, monthsLeft: 10, surplus: 2_000_000, gapMultiple: .45, plans: { keep_deadline: plan, extend_deadline: { ...plan, id: "extend_deadline", available: false }, reduce_amount: { ...plan, id: "reduce_amount", available: false } }, insights: { keep_deadline: { healthImpact: [], cautions: [] }, extend_deadline: { healthImpact: [], cautions: [] }, reduce_amount: { healthImpact: [], cautions: [] } }, provenance: { source: "mock", monthsUsed: 3, basis: "average_surplus" } };
const goal = { id: "saved", name: "Du lịch", updatedAt: "2026-09-15", status: "active", currentAmount: 1_000_000, targetAmount: 10_000_000, targetDate: "2027-09-15", flexibility: "flexible", monthlyContribution: 500_000 } as SavingsGoalView;
beforeEach(() => {
  mocks.advisor.mockReset(); mocks.update.mockReset(); mocks.narration.mockReset();
  mocks.advisor.mockReturnValue({ phase: "ready", analysis, selectedPlanId: "keep_deadline", selectPlan: vi.fn() });
  mocks.narration.mockReturnValue({ verdict: null, plans: {} });
  mocks.update.mockResolvedValue({ ok: true });
});
describe("saved goal assessment", () => {
  it("uses current accumulated money and requests explanation without conversation", () => {
    render(<SavedGoalAssessment goal={goal} onUpdated={() => {}} />);
    expect(mocks.advisor.mock.calls[0][0].openingAmount).toBe(1_000_000);
    expect(mocks.narration).toHaveBeenCalledWith(null, goal.name, analysis);
    expect(screen.getByText(/cần thêm khoảng 400,000 VND/)).toBeInTheDocument();
  });
  it("reviews before updating and excludes hypothetical funding from the saved contribution", async () => {
    const updated = vi.fn();
    render(<SavedGoalAssessment goal={goal} onUpdated={updated} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem điều chỉnh mục tiêu" }));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận điều chỉnh" }));
    await waitFor(() => expect(updated).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith("saved", { targetDate: "2027-09-15", targetAmount: 10_000_000, monthlyContribution: 900_000 });
  });
  it("states missing cashflow and does not offer unsupported plans", () => {
    mocks.advisor.mockReturnValue({ phase: "ready", analysis: { ...analysis, verdict: "unknown", surplus: "unknown" }, selectedPlanId: "keep_deadline" });
    render(<SavedGoalAssessment goal={goal} onUpdated={() => {}} />);
    expect(screen.getByText(/Chưa đủ dữ liệu thu chi để tính/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem điều chỉnh mục tiêu" })).not.toBeInTheDocument();
  });
  it("retries assessment independently of the saved goal", () => {
    mocks.advisor.mockReturnValue({ phase: "failed", analysis: null });
    render(<SavedGoalAssessment goal={goal} onUpdated={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại đánh giá" }));
    expect(mocks.advisor.mock.calls.at(-1)?.[1]).toContain(":1");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
