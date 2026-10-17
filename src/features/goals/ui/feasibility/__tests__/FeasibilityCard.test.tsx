import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatDate, formatVnd } from "@/lib/format";
import type { FeasibilityResponse, Lever } from "../../../model/types";
import { GOALS_COPY } from "../../copy";
import { FeasibilityCard } from "../FeasibilityCard";

function response(
  result: FeasibilityResponse["feasibility"]["result"],
  levers: Lever[] = [],
): FeasibilityResponse {
  return {
    surplus: result === "unknown" ? "unknown" : 12_000_000,
    feasibility: {
      monthsLeft: 36,
      requiredMonthly: result === "met" ? 0 : 16_666_667,
      surplus: result === "unknown" ? "unknown" : 12_000_000,
      result,
      source: "estimated",
    },
    levers,
  };
}

const extend: Lever = { kind: "extend_date", newDate: "2030-11-15", months: 50 };
const cut: Lever = { kind: "cut_category", categoryId: "food", cutPerMonth: 4_666_667, enough: true };

function renderCard(
  data: FeasibilityResponse | null,
  extras: { loading?: boolean; estimate?: string; onApplyLever?: (lever: Lever) => void } = {},
) {
  const onApplyLever = extras.onApplyLever ?? vi.fn();
  const onEstimateChange = vi.fn();
  render(
    <FeasibilityCard
      data={data}
      loading={extras.loading ?? false}
      estimate={extras.estimate ?? ""}
      onEstimateChange={onEstimateChange}
      onApplyLever={onApplyLever}
    />,
  );
  return { onApplyLever, onEstimateChange };
}

describe("FeasibilityCard", () => {
  it("shows the met, feasible, infeasible and unknown branches", () => {
    const { rerender } = render(
      <FeasibilityCard
        data={response("met")}
        loading={false}
        estimate=""
        onEstimateChange={vi.fn()}
        onApplyLever={vi.fn()}
      />,
    );
    expect(screen.getByText("Bạn đã đạt mục tiêu này.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Phần dư ước tính mỗi tháng")).not.toBeInTheDocument();

    rerender(
      <FeasibilityCard
        data={response("feasible")}
        loading={false}
        estimate=""
        onEstimateChange={vi.fn()}
        onApplyLever={vi.fn()}
      />,
    );
    expect(screen.getByText("Khả thi với phần dư hiện tại.")).toBeInTheDocument();

    rerender(
      <FeasibilityCard
        data={response("infeasible", [extend, cut])}
        loading={false}
        estimate=""
        onEstimateChange={vi.fn()}
        onApplyLever={vi.fn()}
      />,
    );
    expect(screen.getByText("Chưa khả thi với phần dư hiện tại.")).toBeInTheDocument();
    expect(screen.getByText("Gợi ý điều chỉnh")).toBeInTheDocument();

    rerender(
      <FeasibilityCard
        data={response("unknown")}
        loading={false}
        estimate=""
        onEstimateChange={vi.fn()}
        onApplyLever={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Phần dư ước tính mỗi tháng")).toBeInTheDocument();
  });

  it("keeps the estimate field while the text is non-empty", () => {
    renderCard(response("met"), { estimate: "12000000" });
    expect(screen.getByText("Bạn đã đạt mục tiêu này.")).toBeInTheDocument();
    expect(screen.getByLabelText("Phần dư ước tính mỗi tháng")).toHaveValue("12000000");
  });

  it("applies an extend chip and does not render the category cut as a button", () => {
    const onApplyLever = vi.fn();
    renderCard(response("infeasible", [extend, cut]), { onApplyLever });
    const label = GOALS_COPY.feasibility.extendDate(formatDate(extend.newDate));
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onApplyLever).toHaveBeenCalledWith(extend);

    const cutLabel = GOALS_COPY.feasibility.cutCategory(formatVnd(cut.cutPerMonth));
    expect(screen.getByText(cutLabel).tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: cutLabel })).not.toBeInTheDocument();
  });

  it("shows the calculating line only while a check is in flight", () => {
    const { rerender } = render(
      <FeasibilityCard data={null} loading estimate="" onEstimateChange={vi.fn()} onApplyLever={vi.fn()} />,
    );
    expect(screen.getByText("Đang tính khả năng đạt mục tiêu…")).toBeInTheDocument();
    rerender(
      <FeasibilityCard data={null} loading={false} estimate="" onEstimateChange={vi.fn()} onApplyLever={vi.fn()} />,
    );
    expect(screen.queryByText("Đang tính khả năng đạt mục tiêu…")).not.toBeInTheDocument();
  });
});
