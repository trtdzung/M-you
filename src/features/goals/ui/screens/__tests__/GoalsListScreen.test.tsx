import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavingsGoalView } from "../../../model/types";
import { GoalsListScreen } from "../GoalsListScreen";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
}));

const list = vi.hoisted(() => ({
  refresh: vi.fn(),
  data: null as SavingsGoalView[] | null,
  loading: false,
  error: null as string | null,
}));
vi.mock("../../../client/hooks/use-goals-list", () => ({
  useGoalsList: () => ({
    data: list.data,
    loading: list.loading,
    error: list.error,
    status: null,
    refresh: list.refresh,
  }),
}));

function view(overrides: Partial<SavingsGoalView> & Pick<SavingsGoalView, "id" | "name" | "status">): SavingsGoalView {
  return {
    targetAmount: 600_000_000,
    targetDate: "2029-09-15",
    flexibility: "flexible",
    monthlyContribution: null,
    jarId: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    source: "self_reported",
    currentAmount: 0,
    progress: { percent: 0, milestone: 0, state: "on_track", expectedAmount: 0 },
    feasibility: {
      monthsLeft: 36,
      requiredMonthly: 16_666_667,
      surplus: "unknown",
      result: "unknown",
      source: "estimated",
    },
    ...overrides,
  };
}

beforeEach(() => {
  nav.push.mockReset();
  list.refresh.mockReset();
  list.data = null;
  list.loading = false;
  list.error = null;
});

describe("GoalsListScreen", () => {
  it("shows a loading skeleton", () => {
    list.loading = true;
    const { container } = render(<GoalsListScreen />);
    expect(container.querySelector(".shimmer")).toBeTruthy();
    expect(screen.queryByText("Chưa có mục tiêu nào")).not.toBeInTheDocument();
  });

  it("shows the error and retries", () => {
    list.error = "Mất mạng";
    render(<GoalsListScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("Mất mạng");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(list.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the inline form when there are no goals", () => {
    list.data = [];
    render(<GoalsListScreen />);
    expect(screen.getByText("Bạn muốn tích lũy cho điều gì?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo mục tiêu" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("groups archived goals, opens a goal, and validates the inline form", async () => {
    list.data = [
      view({ id: "goal_live", name: "Mua nhà", status: "active" }),
      view({ id: "goal_old", name: "Nhà cũ", status: "archived" }),
    ];
    render(<GoalsListScreen />);
    const archived = screen.getByText("Đã lưu trữ (1)").closest("details");
    expect(archived).toHaveTextContent("Nhà cũ");

    fireEvent.click(screen.getByRole("button", { name: /Mua nhà/ }));
    expect(nav.push).toHaveBeenCalledWith("/goals/goal_live");

    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Bạn muốn tích lũy cho điều gì?")).toBeInTheDocument();
  });
});
