import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FlexibilityBadge } from "../FlexibilityBadge";
import { GoalAmountLine } from "../GoalAmountLine";
import { GoalMilestoneLabel } from "../GoalMilestoneLabel";
import { GoalProgressBar } from "../GoalProgressBar";
import { GoalStatusBadge } from "../GoalStatusBadge";

describe("GoalProgressBar", () => {
  it("exposes a progressbar clamped to 0-100 and a tone class for the state", () => {
    const { rerender } = render(<GoalProgressBar percent={40.5} state="on_track" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "40.5");
    expect(bar.firstElementChild).toHaveClass("bg-positive");

    rerender(<GoalProgressBar percent={150} state="ahead" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-positive");

    rerender(<GoalProgressBar percent={-20} state="slightly_behind" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-warning");

    rerender(<GoalProgressBar percent={10} state="off_track" />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-negative");
  });
});

describe("GoalStatusBadge", () => {
  it("shows the progress state for an active goal and the status when paused or archived", () => {
    const { rerender } = render(<GoalStatusBadge status="active" state="on_track" />);
    expect(screen.getByText("Đúng tiến độ")).toBeInTheDocument();

    rerender(<GoalStatusBadge status="paused" state="on_track" />);
    expect(screen.getByText("Tạm dừng")).toBeInTheDocument();
    expect(screen.queryByText("Đúng tiến độ")).not.toBeInTheDocument();

    rerender(<GoalStatusBadge status="archived" state="off_track" />);
    expect(screen.getByText("Đã lưu trữ")).toBeInTheDocument();
    expect(screen.queryByText("Lệch rõ")).not.toBeInTheDocument();
  });
});

describe("FlexibilityBadge", () => {
  it("labels fixed and flexible goals", () => {
    const { rerender } = render(<FlexibilityBadge flexibility="fixed" />);
    expect(screen.getByText("Hạn cố định")).toBeInTheDocument();
    rerender(<FlexibilityBadge flexibility="flexible" />);
    expect(screen.getByText("Có thể lùi")).toBeInTheDocument();
  });
});

describe("GoalAmountLine", () => {
  it("shows the compact current and target amounts", () => {
    render(<GoalAmountLine current={288_000_000} target={600_000_000} />);
    expect(screen.getByText("288 tr")).toBeInTheDocument();
    expect(screen.getByText(/\/ 600 tr/)).toBeInTheDocument();
  });
});

describe("GoalMilestoneLabel", () => {
  it("labels an unreached goal and a reached milestone", () => {
    const { rerender } = render(<GoalMilestoneLabel milestone={0} />);
    expect(screen.getByText("Chưa đạt mốc nào")).toBeInTheDocument();
    rerender(<GoalMilestoneLabel milestone={50} />);
    expect(screen.getByText("Đã đạt mốc 50%")).toBeInTheDocument();
  });
});
