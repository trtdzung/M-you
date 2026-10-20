import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PlanRoadmapUi } from "@/lib/agent-plan-api";
import { AgentPlanRoadmapCard } from "../AgentPlanRoadmapCard";

const roadmapFixture: PlanRoadmapUi = {
  type: "plan_roadmap",
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
  it("renders the header: title, baseline and assumption chips", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} onChoose={() => {}} />);
    expect(screen.getByText("Căn hộ 1,2 tỷ · 10 năm")).toBeInTheDocument();
    expect(screen.getByText(/thiếu 90 triệu ở hạn/)).toBeInTheDocument();
    expect(screen.getByText("Lãi vay 8%/năm")).toBeInTheDocument();
  });

  it("shows verdict badges", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} onChoose={() => {}} />);
    expect(within(section("Kết hợp tối ưu")).getByText("Khuyến nghị")).toBeInTheDocument();
    expect(within(section("Không vay")).getByText("Trễ hạn")).toBeInTheDocument();
    expect(within(section("Vay mua ngay")).getByText("Không khuyến nghị")).toBeInTheDocument();
  });

  it("expands the recommended plan: timeline rows, action, metrics, risk", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} onChoose={() => {}} />);
    const s = section("Kết hợp tối ưu");
    expect(within(s).getByRole("button", { name: /Kết hợp tối ưu/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(s).getAllByRole("listitem")).toHaveLength(5);
    expect(within(s).getByText("Tháng 1–60")).toBeInTheDocument();
    expect(within(s).getByText("Góp khoảng 12 triệu/tháng vào tiết kiệm MSB")).toBeInTheDocument();
    expect(within(s).getByText("Làm hồ sơ vay ở Mục tiêu → Vay")).toBeInTheDocument();
    expect(within(s).getByText("Trả vay 3,2 triệu/tháng")).toBeInTheDocument();
    expect(within(s).getByText("Số vay: 400 triệu")).toBeInTheDocument();
    expect(within(s).getByText(/Nếu thu nhập không tăng, mua ở tháng 72/)).toBeInTheDocument();
  });

  it("keeps the late plan collapsed until its toggle is clicked", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} onChoose={() => {}} />);
    const s = section("Không vay");
    const toggle = within(s).getByRole("button", { name: /Không vay/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(s).getByText(/trễ 10 tháng/)).toBeInTheDocument(); // headline stays visible
    expect(within(s).queryByText("Giữ quỹ dự phòng")).not.toBeInTheDocument();
    expect(within(s).queryByRole("button", { name: "Chọn phương án này" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(s).getByText("Giữ quỹ dự phòng")).toBeInTheDocument();
    expect(within(s).getByText("Cần 45 triệu, đang có 20 triệu")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows reason for a not_recommended plan, with no toggle and no choose button", () => {
    render(<AgentPlanRoadmapCard ui={roadmapFixture} onChoose={() => {}} />);
    const s = section("Vay mua ngay");
    expect(within(s).getByText("Trả vay vượt dòng tiền hàng tháng")).toBeInTheDocument();
    expect(within(s).queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onChoose with exactly the choice_text", () => {
    const onChoose = vi.fn();
    render(<AgentPlanRoadmapCard ui={roadmapFixture} onChoose={onChoose} />);
    fireEvent.click(within(section("Kết hợp tối ưu")).getByRole("button", { name: "Chọn phương án này" }));
    expect(onChoose).toHaveBeenCalledWith("Tôi chọn phương án Kết hợp tối ưu: mua ở tháng 60");
    fireEvent.click(within(section("Không vay")).getByRole("button", { name: /Không vay/ }));
    fireEvent.click(within(section("Không vay")).getByRole("button", { name: "Chọn phương án này" }));
    expect(onChoose).toHaveBeenLastCalledWith("Tôi chọn phương án Không vay: đạt mục tiêu ở tháng 130");
  });

  it("disabled disables the choose buttons and never calls onChoose", () => {
    const onChoose = vi.fn();
    render(<AgentPlanRoadmapCard ui={roadmapFixture} disabled onChoose={onChoose} />);
    const btn = within(section("Kết hợp tối ưu")).getByRole("button", { name: "Chọn phương án này" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("expands the first choosable plan when none is recommended", () => {
    const ui: PlanRoadmapUi = {
      ...roadmapFixture,
      plans: [roadmapFixture.plans[1], { ...roadmapFixture.plans[2], verdict: "ok" }, roadmapFixture.plans[0]],
    };
    render(<AgentPlanRoadmapCard ui={ui} onChoose={() => {}} />);
    expect(within(section("Kết hợp tối ưu")).getByRole("button", { name: /Kết hợp tối ưu/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(section("Không vay")).getByRole("button", { name: /Không vay/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders two metrics that share a label without a duplicate key warning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ui: PlanRoadmapUi = {
      ...roadmapFixture,
      plans: [{ ...roadmapFixture.plans[2], metrics: [{ label: "Lãi", value: "1 triệu" }, { label: "Lãi", value: "2 triệu" }] }],
    };
    render(<AgentPlanRoadmapCard ui={ui} onChoose={() => {}} />);
    expect(screen.getByText("Lãi: 1 triệu")).toBeInTheDocument();
    expect(screen.getByText("Lãi: 2 triệu")).toBeInTheDocument();
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    spy.mockRestore();
  });
  it("lets long unbroken strings wrap", () => {
    render(<AgentPlanRoadmapCard ui={{ ...roadmapFixture, title: "x".repeat(60) + " · 10 năm" }} onChoose={() => {}} />);
    expect(screen.getByText(/^x{60}/)).toHaveClass("break-words");
  });
});
