import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PlanRoadmapUi } from "@/lib/agent-plan-api";
import type { GoalActionResult } from "@/lib/agent-goal-api";

const send = vi.fn<(cif: string, action: unknown) => Promise<GoalActionResult>>();
vi.mock("@/lib/agent-goal-api", async (orig) => ({ ...(await orig<typeof import("@/lib/agent-goal-api")>()), sendGoalAction: (cif: string, action: unknown) => send(cif, action) }));
vi.mock("@/providers/context", () => ({ usePersona: () => ({ persona: { cif: "CIF_TEST" } }) }));

import { AgentPlanRoadmapCard } from "../AgentPlanRoadmapCard";

beforeEach(() => {
  send.mockReset().mockResolvedValue({ ok: true });
  window.sessionStorage.clear();
});

const roadmapFixture: PlanRoadmapUi = {
  type: "plan_roadmap",
  goal_id: "goal-3",
  title: "Căn hộ 1,2 tỷ · 10 năm",
  baseline: "Đạt mục tiêu ở tháng 130 (thiếu 90 triệu ở hạn)",
  assumptions: ["Lãi tiết kiệm 6,8%/năm", "Lãi vay 8%/năm"],
  plans: [
    {
      id: "no_loan",
      name: "Không vay",
      verdict: "late",
      headline: "Đạt mục tiêu ở tháng 130, trễ 10 tháng so với hạn",
      metrics: [{ label: "Lãi tiết kiệm", value: "300–400 triệu" }],
      milestones: [
        { when: "Tháng 0", kind: "reserve", title: "Giữ quỹ dự phòng", detail: "Cần 45 triệu, đang có 20 triệu" },
        { when: "Tháng 130", kind: "buy", title: "Mua mục tiêu" },
      ],
      risk: "Nếu thu nhập không tăng, chưa đạt mục tiêu",
      choice_text: "Tôi chọn phương án Không vay: đạt mục tiêu ở tháng 130",
    },
    {
      id: "loan_now",
      name: "Vay mua ngay",
      verdict: "not_recommended",
      headline: "Mua ở tháng 0, vay 1,1 tỷ",
      reason: "Trả vay vượt dòng tiền hàng tháng",
      metrics: [],
      milestones: [],
    },
    {
      id: "optimized",
      name: "Kết hợp tối ưu",
      verdict: "recommended",
      headline: "Mua ở tháng 60 (năm thứ 5), vay 400 triệu",
      metrics: [{ label: "Số vay", value: "400 triệu" }, { label: "Trả vay", value: "3,2 triệu/tháng" }],
      milestones: [
        { when: "Tháng 1–60", kind: "save", title: "Tiết kiệm", action: "Góp khoảng 12 triệu/tháng vào tiết kiệm MSB" },
        { when: "Tháng 60", kind: "buy", title: "Mua mục tiêu" },
        { when: "Tháng 60", kind: "loan", title: "Vay 400 triệu", action: "Làm hồ sơ vay ở Mục tiêu → Vay" },
        { when: "Tháng 61–300", kind: "repay", title: "Trả vay", detail: "Trả vay 3,2 triệu/tháng" },
        { when: "Tháng 300", kind: "done", title: "Tất toán khoản vay" },
      ],
      risk: "Nếu thu nhập không tăng, mua ở tháng 72",
      choice_text: "Tôi chọn phương án Kết hợp tối ưu: mua ở tháng 60",
    },
  ],
};

const section = (name: string) => screen.getByRole("region", { name });

describe("AgentPlanRoadmapCard", () => {
  it("renders only the title in the header: no baseline and no assumption chips", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} />);
    expect(screen.getByText("Căn hộ 1,2 tỷ · 10 năm")).toBeInTheDocument();
    expect(screen.queryByText(/thiếu 90 triệu ở hạn/)).not.toBeInTheDocument();
    expect(screen.queryByText("Lãi vay 8%/năm")).not.toBeInTheDocument();
  });

  it("shows verdict badges", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} />);
    expect(within(section("Kết hợp tối ưu")).getByText("Khuyến nghị")).toBeInTheDocument();
    expect(within(section("Không vay")).getByText("Trễ hạn")).toBeInTheDocument();
    expect(within(section("Vay mua ngay")).getByText("Không khuyến nghị")).toBeInTheDocument();
  });

  it("expands the recommended plan: timeline rows with title, when and action only", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} />);
    const s = section("Kết hợp tối ưu");
    expect(within(s).getByRole("button", { name: /Kết hợp tối ưu/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(s).getAllByRole("listitem")).toHaveLength(5);
    expect(within(s).getByText("Tháng 1–60")).toBeInTheDocument();
    expect(within(s).getByText("Góp khoảng 12 triệu/tháng vào tiết kiệm MSB")).toBeInTheDocument();
    expect(within(s).getByText("Làm hồ sơ vay ở Mục tiêu → Vay")).toBeInTheDocument();
    // metrics, details and the bad-scenario line are not drawn
    expect(within(s).queryByText("Trả vay 3,2 triệu/tháng")).not.toBeInTheDocument();
    expect(within(s).queryByText("Số vay: 400 triệu")).not.toBeInTheDocument();
    expect(within(s).queryByText(/Nếu thu nhập không tăng, mua ở tháng 72/)).not.toBeInTheDocument();
  });

  it("keeps the late plan collapsed until its toggle is clicked", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} />);
    const s = section("Không vay");
    const toggle = within(s).getByRole("button", { name: /Không vay/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(s).getByText(/trễ 10 tháng/)).toBeInTheDocument(); // headline stays visible
    expect(within(s).queryByText("Giữ quỹ dự phòng")).not.toBeInTheDocument();
    expect(within(s).queryByRole("button", { name: "Chọn phương án này" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(s).getByText("Giữ quỹ dự phòng")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows reason for a not_recommended plan, with no toggle and no choose button", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} />);
    const s = section("Vay mua ngay");
    expect(within(s).getByText("Trả vay vượt dòng tiền hàng tháng")).toBeInTheDocument();
    expect(within(s).queryByRole("button")).not.toBeInTheDocument();
  });

  it("a card from an older conversation (no goal_id) is for reading only: no choose button", () => {
    const { goal_id: _goal, ...legacy } = roadmapFixture;
    render(<AgentPlanRoadmapCard ui={legacy as PlanRoadmapUi} />);
    expect(screen.queryByRole("button", { name: "Chọn phương án này" })).not.toBeInTheDocument();
    expect(screen.getByText("Căn hộ 1,2 tỷ · 10 năm")).toBeInTheDocument();
  });

  it("expands the first choosable plan when none is recommended", () => {
    const ui: PlanRoadmapUi = {
      ...roadmapFixture,
      plans: [roadmapFixture.plans[1], { ...roadmapFixture.plans[2], verdict: "ok" }, roadmapFixture.plans[0]],
    };
    render(<AgentPlanRoadmapCard ui={ui} />);
    expect(within(section("Kết hợp tối ưu")).getByRole("button", { name: /Kết hợp tối ưu/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(section("Không vay")).getByRole("button", { name: /Không vay/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("lets long unbroken strings wrap", () => {
    render(<AgentPlanRoadmapCard ui={{ ...roadmapFixture, title: "x".repeat(60) + " · 10 năm" }} />);
    expect(screen.getByText(/^x{60}/)).toHaveClass("break-words");
  });

  describe("for an existing goal (goal_id)", () => {
    const withMonths = (goalId: string): PlanRoadmapUi => ({
      ...roadmapFixture,
      goal_id: goalId,
      plans: roadmapFixture.plans.map((p) =>
        p.id === "optimized"
          ? { ...p, milestones: [
              { ...p.milestones[0], month: 1, end_month: 60 },
              { ...p.milestones[1], month: 60 },
              { ...p.milestones[2], month: 60 },
              { ...p.milestones[3], month: 61, end_month: 300 },
              { ...p.milestones[4], month: 300 },
            ] }
          : p,
      ),
    });

    it("saves the plan as the goal's roadmap and does NOT message the agent", async () => {
      render(<AgentPlanRoadmapCard ui={withMonths("goal-3")} />);
      const button = within(screen.getByRole("region", { name: "Kết hợp tối ưu" })).getByRole("button", { name: "Chọn phương án này" });
      fireEvent.click(button);
      await waitFor(() => expect(within(screen.getByRole("region", { name: "Kết hợp tối ưu" })).getByRole("button", { name: "Đã đặt lộ trình" })).toBeDisabled());
      expect(send).toHaveBeenCalledTimes(1);
      const [cif, action] = send.mock.calls[0] as [string, { type: string; goalId: string; planId: string; planName: string; milestones: { month: number; endMonth?: number; kind: string }[] }];
      expect(cif).toBe("CIF_TEST");
      expect(action).toMatchObject({ type: "setRoadmap", goalId: "goal-3", planId: "optimized", planName: "Kết hợp tối ưu" });
      expect(action.milestones.map((m) => [m.month, m.endMonth, m.kind])).toEqual([[1, 60, "save"], [60, undefined, "buy"], [60, undefined, "loan"], [61, 300, "repay"], [300, undefined, "done"]]);
    });

    it("is not blocked by the chat (it never talks to the chat)", async () => {
      render(<AgentPlanRoadmapCard ui={withMonths("goal-3")} />);
      const button = within(screen.getByRole("region", { name: "Kết hợp tối ưu" })).getByRole("button", { name: "Chọn phương án này" });
      expect(button).toBeEnabled();
    });

    it("shows the error and stays usable when the goal refuses the roadmap", async () => {
      send.mockResolvedValueOnce({ ok: false, error: "Mục tiêu đã kết thúc nên không đặt lộ trình được." });
      render(<AgentPlanRoadmapCard ui={withMonths("goal-3")} />);
      const section = screen.getByRole("region", { name: "Kết hợp tối ưu" });
      fireEvent.click(within(section).getByRole("button", { name: "Chọn phương án này" }));
      expect(await within(section).findByRole("alert")).toHaveTextContent("Mục tiêu đã kết thúc");
      expect(within(section).getByRole("button", { name: "Chọn phương án này" })).toBeEnabled();
    });

    it("does not call the action for a plan whose milestones have no months", () => {
      render(<AgentPlanRoadmapCard ui={{ ...roadmapFixture, goal_id: "goal-3" }} />);
      const section = screen.getByRole("region", { name: "Kết hợp tối ưu" });
      fireEvent.click(within(section).getByRole("button", { name: "Chọn phương án này" }));
      expect(send).not.toHaveBeenCalled();
      expect(within(section).getByRole("alert")).toHaveTextContent("chưa có mốc thời gian");
    });

    it("shows an already applied plan as applied when the card is rendered again (history)", async () => {
      const ui = withMonths("goal-3");
      const first = render(<AgentPlanRoadmapCard ui={ui} />);
      fireEvent.click(within(screen.getByRole("region", { name: "Kết hợp tối ưu" })).getByRole("button", { name: "Chọn phương án này" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Đã đặt lộ trình" })).toBeDisabled());
      first.unmount();
      render(<AgentPlanRoadmapCard ui={ui} />);
      expect(screen.getByRole("button", { name: "Đã đặt lộ trình" })).toBeDisabled();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
