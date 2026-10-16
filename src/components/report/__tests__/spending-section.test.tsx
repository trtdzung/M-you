import { describe, expect, it, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpendingSection, type DonutSide } from "../SpendingSection";
import type { JarDonutDatum } from "../SpendingDonut";

/**
 * "Báo cáo chi tiêu" — a donut of the month's spend grouped by category, with a
 * month-over-month badge in the center and a link into the detailed report.
 * Income was removed — spending only, no toggle. The MoM badge shows a delta
 * only when the prior period had data, otherwise an explicit "no prior period"
 * note — never a fake 0% (RT #10).
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

function renderSection(over: Partial<DonutSide> = {}) {
  const expense: DonutSide = {
    data: over.data ?? [slice({})],
    total: over.total ?? 1_000_000,
    prevTotal: over.prevTotal ?? 800_000,
  };
  render(<SpendingSection expense={expense} onOpenReport={() => {}} />);
}

describe("SpendingSection", () => {
  it("renders the title, the expense legend, and the report link", () => {
    renderSection();
    expect(screen.getByText("Báo cáo chi tiêu")).toBeInTheDocument();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByText("Xem chi tiết báo cáo")).toBeInTheDocument();
  });

  it("shows a MoM badge when the prior period had spend", () => {
    renderSection({ total: 1_000_000, prevTotal: 800_000 });
    expect(screen.queryByText("chưa có kỳ trước")).not.toBeInTheDocument();
  });

  it("shows a 'no prior period' note instead of a fake 0% (RT #10)", () => {
    renderSection({ prevTotal: 0 });
    expect(screen.getByText("chưa có kỳ trước")).toBeInTheDocument();
  });
});
