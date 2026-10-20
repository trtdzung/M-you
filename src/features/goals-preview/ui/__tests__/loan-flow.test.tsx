import React from "react";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stateFromScenario } from "../../store/reducer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} }),
  usePathname: () => "/goals",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/providers/context", () => ({
  usePersonaCif: () => "CIF_0001",
}));

vi.mock("@/components/shell/PanelActive", () => ({
  usePanelActive: () => true,
}));

import { PreviewStoreProvider, usePreview } from "../../store/PreviewStore";
import { ScreenHost } from "../ScreenHost";

const box = vi.hoisted(() => ({ ctx: null as any }));
function Probe() {
  box.ctx = usePreview();
  return null;
}

describe("Loan flow: Goal 'Vay' → LoanAppHome → LoanAppSurvey 20s approval and the customer's switch to repayment", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("Goal 'Vay' → LoanAppHome → LoanAppSurvey; 'Tiếp tục' disabled until filled; stores application in localStorage and shows toast; dispatches takeLoan 20s later", async () => {
    const baseWorld = stateFromScenario("s01-car-feasible");
    const testGoal = { ...baseWorld.goals[0], targetAmount: 500_000_000 };
    // Set account balance to 200,000,000 (40% of targetAmount > 30% LOAN_MIN_SAVED_RATIO) so 'Vay' navigates directly
    const testAccount = { ...baseWorld.accounts.find((a) => a.id === testGoal.accountId)!, balance: 200_000_000 };

    const world = {
      ...baseWorld,
      customer: { ...baseWorld.customer, cif: "CIF_0001" },
      goals: [testGoal],
      accounts: [testAccount],
      loans: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        return new Response(
          JSON.stringify({
            world,
            market: { instruments: [], refreshing: false, asOf: null },
          }),
        );
      }),
    );

    render(
      <PreviewStoreProvider>
        <Probe />
        <ScreenHost />
      </PreviewStoreProvider>,
    );

    // Wait until world is loaded
    await waitFor(() => expect(box.ctx?.loadStatus).toBe("ready"));

    // Activate fake timers now for testing the 20s delayed loan dispatch
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

    // 1. Navigate to GoalDetail
    act(() => {
      box.ctx.nav.push("GoalDetail", { goalId: testGoal.id });
    });

    // Click quick action "Vay"
    const vayButton = screen.getByRole("button", { name: "Vay" });
    act(() => {
      fireEvent.click(vayButton);
    });

    // 2. Now on LoanAppHome -> Click "Đăng ký ngay"
    expect(screen.getByRole("heading", { name: /Hạn mức thông minh\s*Linh hoạt tài chính/ })).toBeInTheDocument();
    const applyButton = screen.getByRole("button", { name: "Đăng ký ngay" });
    act(() => {
      fireEvent.click(applyButton);
    });

    // 3. Now on LoanAppSurvey
    expect(screen.getByRole("heading", { name: "Khảo sát thông tin" })).toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "Tiếp tục" });
    // "Tiếp tục" is disabled until required fields are filled
    expect(continueButton).toBeDisabled();

    // Fill in required fields
    const ageInput = screen.getByLabelText("Độ tuổi của bạn");
    act(() => {
      fireEvent.change(ageInput, { target: { value: "30" } });
    });
    expect(continueButton).toBeDisabled();

    const genderSelect = screen.getByLabelText(/Giới tính của bạn/);
    act(() => {
      fireEvent.change(genderSelect, { target: { value: "Nam" } });
    });
    expect(continueButton).toBeDisabled();

    const sourceSelect = screen.getByLabelText(/Nguồn thu nhập chính của bạn là gì\?/);
    act(() => {
      fireEvent.change(sourceSelect, { target: { value: "Lương" } });
    });
    expect(continueButton).toBeDisabled();

    const incomeInput = screen.getByLabelText("Tổng thu nhập hàng tháng của bạn là bao nhiêu?");
    act(() => {
      fireEvent.change(incomeInput, { target: { value: "35000000" } });
    });
    expect(continueButton).toBeDisabled();

    const debtSelect = screen.getByLabelText(/Bạn có đang vay ở tổ chức tài chính nào khác không\?/);
    act(() => {
      fireEvent.change(debtSelect, { target: { value: "Không" } });
    });
    expect(continueButton).toBeDisabled();

    const principalInput = screen.getByLabelText("Bạn cần vay bao nhiêu tiền?");
    act(() => {
      fireEvent.change(principalInput, { target: { value: "250000000" } });
    });
    expect(continueButton).toBeDisabled();

    const termSelect = screen.getByLabelText(/Bạn muốn trả trong bao lâu\?/);
    act(() => {
      fireEvent.change(termSelect, { target: { value: "24 tháng" } });
    });
    expect(continueButton).toBeDisabled();

    const collateralSelect = screen.getByLabelText(/Bạn có tài sản nào có thể dùng để đảm bảo cho khoản vay không\?/);
    act(() => {
      fireEvent.change(collateralSelect, { target: { value: "Ô tô" } });
    });

    // Now all required fields are filled -> "Tiếp tục" is enabled!
    expect(continueButton).not.toBeDisabled();

    // 4. Submit application
    act(() => {
      fireEvent.click(continueButton);
    });

    // Submitting stores { goalId, principal, termMonths, submittedAt } under goals-preview:loan-app:<cif>
    const storedRaw = localStorage.getItem("goals-preview:loan-app:CIF_0001");
    expect(storedRaw).toBeTruthy();
    const stored = JSON.parse(storedRaw!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      goalId: testGoal.id,
      principal: 250_000_000,
      termMonths: 24,
      submittedAt: expect.any(Number),
    });

    // Shows toast "Hồ sơ đăng ký thành công"
    expect(box.ctx.state.toasts.some((t: any) => t.message === "Hồ sơ đăng ký thành công")).toBe(true);

    // Goal before timer is still not repaying
    const goalBeforeTimer = box.ctx.state.goals.find((g: any) => g.id === testGoal.id);
    expect(goalBeforeTimer.status).toBe("accumulating");
    expect(goalBeforeTimer.loanId).toBeUndefined();
    // The goal page shows a fixed box: waiting for approval, with a way to look at the application
    expect(screen.getByText("Hồ sơ của bạn đang chờ phê duyệt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem hồ sơ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chuyển sang giai đoạn trả nợ vay" })).not.toBeInTheDocument();

    // 5. Advance timers by 20 seconds: the application is approved, but no loan exists until the customer asks for it
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    const stillAccumulating = box.ctx.state.goals.find((g: any) => g.id === testGoal.id);
    expect(stillAccumulating.status).toBe("accumulating");
    expect(stillAccumulating.loanId).toBeUndefined();
    expect(box.ctx.loanApplications).toHaveLength(1);
    expect(box.ctx.loanApplications[0].status).toBe("approved");
    expect(screen.getByText("Hồ sơ của bạn đã được phê duyệt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem hồ sơ" })).toBeInTheDocument();

    // 6. "Chuyển sang giai đoạn trả nợ vay" only opens the settle bottom sheet; the goal stays in phase 1
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Chuyển sang giai đoạn trả nợ vay" }));
    });
    expect(screen.getByRole("dialog", { name: /Xác nhận mua/ })).toBeInTheDocument();
    expect(screen.getByText("Nguồn thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Khoản vay của bạn")).toBeInTheDocument();
    expect(screen.getByText("Trả hằng tháng")).toBeInTheDocument();
    expect(screen.getByText("Sau khi xác nhận, bạn không thể hoàn tác.")).toBeInTheDocument();
    expect(box.ctx.state.goals.find((g: any) => g.id === testGoal.id).status).toBe("accumulating");
    // 7. "Xác nhận mua tài sản": takeLoan runs once and the application is removed
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Xác nhận mua tài sản" }));
    });
    expect(screen.queryByText("Hồ sơ của bạn đã được phê duyệt")).not.toBeInTheDocument();
    const goalAfterLoan = box.ctx.state.goals.find((g: any) => g.id === testGoal.id);
    expect(goalAfterLoan.status).toBe("repaying");
    expect(goalAfterLoan.loanId).toBeTruthy();

    const createdLoan = box.ctx.state.loans.find((l: any) => l.id === goalAfterLoan.loanId);
    expect(createdLoan).toBeDefined();
    expect(createdLoan?.principal).toBe(250_000_000);
    expect(createdLoan?.termMonths).toBe(24);

    const storedAfter = JSON.parse(localStorage.getItem("goals-preview:loan-app:CIF_0001") ?? "[]");
    expect(storedAfter).toEqual([]);

    // Asking again (or waiting) never creates a second loan
    const loanCount = box.ctx.state.loans.length;
    act(() => {
      box.ctx.startRepayment(testGoal.id);
      vi.advanceTimersByTime(20_000);
    });
    expect(box.ctx.state.loans.length).toBe(loanCount);
  });
});
