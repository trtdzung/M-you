import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalLedgerEntry, SavingsGoalView } from "../../../model/types";
import { GoalDetailScreen } from "../GoalDetailScreen";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
}));

const detail = vi.hoisted(() => ({
  refresh: vi.fn(),
  data: null as { goal: SavingsGoalView; ledger: GoalLedgerEntry[] } | null,
  loading: false,
  error: null as string | null,
  status: null as number | null,
}));
vi.mock("../../../client/hooks/use-goal-detail", () => ({
  useGoalDetail: () => ({
    data: detail.data,
    loading: detail.loading,
    error: detail.error,
    status: detail.status,
    refresh: detail.refresh,
  }),
}));

const mutations = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  pending: false,
  errors: null as Record<string, string> | null,
}));
vi.mock("../../../client/hooks/use-goal-mutations", () => ({
  useGoalMutations: () => ({
    update: mutations.update,
    remove: mutations.remove,
    create: vi.fn(),
    pending: mutations.pending,
    errors: mutations.errors,
    reset: vi.fn(),
  }),
}));

const goal: SavingsGoalView = {
  id: "goal_1",
  name: "Mua nhà",
  targetAmount: 600_000_000,
  targetDate: "2029-09-15",
  flexibility: "flexible",
  monthlyContribution: null,
  status: "active",
  jarId: null,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  source: "self_reported",
  currentAmount: 1_000_000,
  progress: { percent: 0.2, milestone: 0, state: "on_track", expectedAmount: 0 },
  feasibility: {
    monthsLeft: 36,
    requiredMonthly: 16_666_667,
    surplus: "unknown",
    result: "unknown",
    source: "estimated",
  },
};

beforeEach(() => {
  nav.replace.mockReset();
  detail.refresh.mockReset();
  detail.data = { goal, ledger: [] };
  detail.loading = false;
  detail.error = null;
  detail.status = null;
  mutations.pending = false;
  mutations.errors = null;
  mutations.update.mockReset();
  mutations.remove.mockReset();
  mutations.update.mockResolvedValue({ ok: true, data: undefined });
  mutations.remove.mockResolvedValue({ ok: true, data: undefined });
});

describe("GoalDetailScreen", () => {
  it("renders the goal", () => {
    render(<GoalDetailScreen id="goal_1" />);
    expect(screen.getByRole("heading", { name: "Mua nhà" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Góp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rút" })).toBeInTheDocument();
  });

  it("offers a way back to the list when the goal is missing", () => {
    detail.data = null;
    detail.status = 404;
    detail.error = "not found";
    render(<GoalDetailScreen id="missing" />);
    expect(screen.getByText("Không tìm thấy mục tiêu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Về danh sách mục tiêu" }));
    expect(nav.replace).toHaveBeenCalledWith("/goals");
  });

  it("pauses, resumes and archives through update", async () => {
    const { rerender } = render(<GoalDetailScreen id="goal_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng" }));
    await waitFor(() => expect(mutations.update).toHaveBeenCalledWith("goal_1", { status: "paused" }));
    expect(detail.refresh).toHaveBeenCalled();

    detail.data = { goal: { ...goal, status: "paused" }, ledger: [] };
    rerender(<GoalDetailScreen id="goal_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(mutations.update).toHaveBeenCalledWith("goal_1", { status: "active" }));

    fireEvent.click(screen.getByRole("button", { name: "Lưu trữ" }));
    await waitFor(() => expect(mutations.update).toHaveBeenCalledWith("goal_1", { status: "archived" }));
  });

  it("deletes after confirmation and leaves the detail route", async () => {
    render(<GoalDetailScreen id="goal_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa mục tiêu" }));
    await waitFor(() => expect(mutations.remove).toHaveBeenCalledWith("goal_1"));
    expect(nav.replace).toHaveBeenCalledWith("/goals");
  });

  it("opens the contribute sheet", async () => {
    render(<GoalDetailScreen id="goal_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Góp" }));
    expect(await screen.findByRole("dialog", { name: "Góp vào mục tiêu" })).toBeInTheDocument();
  });

  it("opens the withdraw sheet", async () => {
    render(<GoalDetailScreen id="goal_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Rút" }));
    expect(await screen.findByRole("dialog", { name: "Rút khỏi mục tiêu" })).toBeInTheDocument();
  });
});
