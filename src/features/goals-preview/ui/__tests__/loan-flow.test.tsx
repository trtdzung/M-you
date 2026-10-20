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

describe("Loan flow: Goal 'Vay' → LoanAppHome → LoanAppSurvey and 20s delayed loan dispatch", () => {
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

    // 5. Advance timers by 20 seconds
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    // takeLoan was dispatched once for that goal
    const goalAfterLoan = box.ctx.state.goals.find((g: any) => g.id === testGoal.id);
    expect(goalAfterLoan.status).toBe("repaying");
    expect(goalAfterLoan.loanId).toBeTruthy();

    const createdLoan = box.ctx.state.loans.find((l: any) => l.id === goalAfterLoan.loanId);
    expect(createdLoan).toBeDefined();
    expect(createdLoan?.principal).toBe(250_000_000);
    expect(createdLoan?.termMonths).toBe(24);

    // Record is removed from localStorage
    const storedAfter = JSON.parse(localStorage.getItem("goals-preview:loan-app:CIF_0001") ?? "[]");
    expect(storedAfter).toEqual([]);

    // Advance another 20s -> verify takeLoan was only dispatched once
    const loanCount = box.ctx.state.loans.length;
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(box.ctx.state.loans.length).toBe(loanCount);
  });
});
