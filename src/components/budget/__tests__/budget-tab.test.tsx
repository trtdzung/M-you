import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Financials } from "@/domain/engine/finance-compose";
import type { JarBudgetResult } from "@/domain/engine/jar-budget";
import { monthPeriod } from "@/domain/engine/types";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(""),
}));

let mockResult: { loading: boolean; error: boolean; financials: Financials | null };
vi.mock("@/state/useFinancials", () => ({ useFinancials: () => mockResult }));
vi.mock("@/components/common/PeriodPicker", () => ({ PeriodPicker: () => <div>period</div> }));

import { BudgetTab } from "../BudgetTab";

const JUNE = monthPeriod(2026, 5);

function jarBudget(over: Partial<JarBudgetResult["summary"]>, lines: JarBudgetResult["lines"]): JarBudgetResult {
  return {
    lines,
    summary: {
      totalLimit: 5_000_000,
      totalSpent: 2_400_000,
      totalSpentSet: 2_400_000,
      totalRemaining: 2_600_000,
      pctUsed: 0.48,
      daysLeft: 11,
      setCount: lines.filter((l) => l.limitState === "set").length,
      unsetCount: lines.filter((l) => l.limitState === "unset").length,
      ...over,
    },
    meta: { period: JUNE, sourceCoverage: { sources: ["mock"], knownCount: 1, unknownCount: 0 }, freshness: null },
  };
}

function line(over: Partial<JarBudgetResult["lines"][number]>): JarBudgetResult["lines"][number] {
  return {
    huId: "food", label: "Ăn uống", categoryIds: ["dining"], spent: 1_400_000, prevSpent: 1_000_000,
    momDelta: 400_000, momPct: 0.4, limit: 4_000_000, limitState: "set", remaining: 2_600_000,
    pct: 0.35, status: "ok", thresholdHit: false, source: "mock", freshness: null, ...over,
  };
}

function withBudget(jb: JarBudgetResult, overAllocated = false): Financials {
  return {
    jarBudget: jb,
    unallocatedPool: { amount: overAllocated ? -1 : 0, overAllocated, source: "mock" },
  } as unknown as Financials;
}

describe("BudgetTab", () => {
  it("shows the error state", () => {
    mockResult = { loading: false, error: true, financials: null };
    render(<BudgetTab />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the gauge % and jar cards from the engine", () => {
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [line({})])) };
    render(<BudgetTab />);
    expect(screen.getByLabelText("Đã dùng 48% tổng hạn mức")).toBeInTheDocument();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
  });

  it("lists an unset-limit jar separately as 'Chưa đặt hạn mức', never 0%", () => {
    const unset = line({ huId: "savings", label: "Tiết kiệm", categoryIds: [], limit: null, limitState: "unset", remaining: null, pct: null, status: null, spent: 0 });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [line({}), unset])) };
    render(<BudgetTab />);
    expect(screen.getByText("Chưa đặt hạn mức")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt hạn mức" })).toBeInTheDocument();
  });

  it("shows a 'Chưa đặt' gauge when no jar has a limit (unknown, not 0%)", () => {
    const unset = line({ limit: null, limitState: "unset", remaining: null, pct: null, status: null, spent: 0 });
    mockResult = {
      loading: false, error: false,
      financials: withBudget(jarBudget({ totalLimit: null, totalRemaining: null, pctUsed: null, totalSpentSet: 0 }, [unset])),
    };
    render(<BudgetTab />);
    expect(screen.getByLabelText("Chưa đặt hạn mức cho hũ nào")).toBeInTheDocument();
  });

  it("shows an empty state with no jars", () => {
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [])) };
    render(<BudgetTab />);
    expect(screen.getByText("Chưa có hũ nào")).toBeInTheDocument();
  });

  it("shows the 'Vượt phân bổ' badge when unallocatedPool.overAllocated is true (RT#13)", () => {
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [line({})]), true) };
    render(<BudgetTab />);
    expect(screen.getByText("Vượt phân bổ")).toBeInTheDocument();
  });

  it("hides the 'Vượt phân bổ' badge when unallocatedPool.overAllocated is false", () => {
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [line({})]), false) };
    render(<BudgetTab />);
    expect(screen.queryByText("Vượt phân bổ")).not.toBeInTheDocument();
  });
});
