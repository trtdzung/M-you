import { describe, expect, it, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JarBudgetLine } from "@/domain/engine";
import { SpendingSection } from "../SpendingSection";

/**
 * "Báo cáo thu chi" — the overview's spend-by-jar section: donut + month-over-month
 * + a link into the detailed report. MoM shows a delta only when the prior period
 * had spend, otherwise an explicit "no prior period" note — never a fake 0% (RT #10).
 */
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const line = (over: Partial<JarBudgetLine>): JarBudgetLine => ({
  huId: "food", label: "Ăn uống", categoryIds: ["dining"], spent: 1_000_000, prevSpent: 800_000,
  momDelta: 200_000, momPct: 0.25, limit: 4_000_000, limitState: "set", remaining: 3_000_000,
  pct: 0.25, status: "ok", thresholdHit: false, source: "mock", freshness: null, ...over,
});

function renderSection(over: Partial<Parameters<typeof SpendingSection>[0]> = {}) {
  render(
    <SpendingSection
      lines={over.lines ?? [line({})]}
      expense={over.expense ?? 1_000_000}
      prevExpense={over.prevExpense ?? 800_000}
      onOpenReport={over.onOpenReport ?? (() => {})}
    />,
  );
}

describe("SpendingSection", () => {
  it("renders the jar legend and the report link", () => {
    renderSection();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByText("Xem chi tiết báo cáo")).toBeInTheDocument();
  });

  it("shows a MoM delta when the prior period had spend", () => {
    renderSection({ expense: 1_000_000, prevExpense: 800_000 });
    expect(screen.getByText("So với tháng trước")).toBeInTheDocument();
    expect(screen.queryByText("— chưa có kỳ trước")).not.toBeInTheDocument();
  });

  it("shows a 'no prior period' note instead of a fake 0% (RT #10)", () => {
    renderSection({ prevExpense: 0 });
    expect(screen.getByText("— chưa có kỳ trước")).toBeInTheDocument();
  });

  it("drops zero-spend jars from the donut legend", () => {
    renderSection({ lines: [line({}), line({ huId: "savings", label: "Tiết kiệm", spent: 0 })] });
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.queryByText("Tiết kiệm")).not.toBeInTheDocument();
  });
});
