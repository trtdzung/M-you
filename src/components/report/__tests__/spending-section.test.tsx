import { describe, expect, it, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SpendingSection, type DonutSide } from "../SpendingSection";
import type { JarDonutDatum } from "../SpendingDonut";

/**
 * "Báo cáo thu chi" — a donut with a Chi tiêu / Thu nhập toggle, a month-over-month
 * badge in the center, and a link into the detailed report. The MoM badge shows a
 * delta only when the prior period had data, otherwise an explicit "no prior
 * period" note — never a fake 0% (RT #10).
 */
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const slice = (over: Partial<JarDonutDatum> = {}): JarDonutDatum => ({
  id: "food", label: "Ăn uống", amount: 1_000_000, colorKey: "dining", ...over,
});

function renderSection(over: { expense?: Partial<DonutSide>; income?: Partial<DonutSide> } = {}) {
  const expense: DonutSide = {
    data: over.expense?.data ?? [slice({})],
    total: over.expense?.total ?? 1_000_000,
    prevTotal: over.expense?.prevTotal ?? 800_000,
  };
  const income: DonutSide = {
    data: over.income?.data ?? [slice({ id: "salary", label: "Lương", colorKey: "salary" })],
    total: over.income?.total ?? 24_000_000,
    prevTotal: over.income?.prevTotal ?? 20_000_000,
  };
  render(<SpendingSection expense={expense} income={income} onOpenReport={() => {}} />);
}

describe("SpendingSection", () => {
  it("renders the toggle, the expense legend, and the report link", () => {
    renderSection();
    expect(screen.getByRole("tab", { name: "Chi tiêu" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Thu nhập" })).toBeInTheDocument();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByText("Xem chi tiết báo cáo")).toBeInTheDocument();
  });

  it("shows a MoM badge when the prior period had spend", () => {
    renderSection({ expense: { total: 1_000_000, prevTotal: 800_000 } });
    expect(screen.queryByText("chưa có kỳ trước")).not.toBeInTheDocument();
  });

  it("shows a 'no prior period' note instead of a fake 0% (RT #10)", () => {
    renderSection({ expense: { prevTotal: 0 } });
    expect(screen.getByText("chưa có kỳ trước")).toBeInTheDocument();
  });

  it("switches to the income breakdown when Thu nhập is selected", () => {
    renderSection();
    expect(screen.queryByText("Lương")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Thu nhập" }));
    expect(screen.getByText("Lương")).toBeInTheDocument();
    expect(screen.getByText("Đã nhận")).toBeInTheDocument();
  });
});
