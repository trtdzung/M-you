import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Financials } from "@/domain/engine/finance-compose";
import type { JarBudgetResult } from "@/domain/engine/jar-budget";
import { monthPeriod } from "@/domain/engine/types";
import type { Transaction } from "@/domain/models";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(""),
}));

let mockResult: { loading: boolean; error: boolean; financials: Financials | null };
vi.mock("@/state/useFinancials", () => ({ useFinancials: () => mockResult }));
vi.mock("@/components/common/PeriodPicker", () => ({ PeriodPicker: () => <div>period</div> }));
// Jar config state: `error` is non-null when GET /api/jars failed (U10).
let jarState: { config: { version: 3; jars: [] }; error: string | null; updateJars: () => Promise<void> };
vi.mock("@/state/jars", () => ({ useJarConfig: () => jarState }));
beforeEach(() => {
  jarState = { config: { version: 3, jars: [] }, error: null, updateJars: vi.fn().mockResolvedValue(undefined) };
});

import { BudgetTab } from "../BudgetTab";

const JUNE = monthPeriod(2026, 5);

function jarBudget(over: Partial<JarBudgetResult["summary"]>, lines: JarBudgetResult["lines"]): JarBudgetResult {
  return {
    lines,
    summary: {
      totalLimit: 5_000_000,
      totalSpent: 2_400_000,
      totalSpentSet: 2_400_000,
      totalRebalanceNet: 0,
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
    momDelta: 400_000, momPct: 0.4, limit: 4_000_000, limitState: "set", rebalanceNet: 0, effectiveLimit: 4_000_000, remaining: 2_600_000,
    pct: 0.35, status: "ok", thresholdHit: false, source: "mock", freshness: null, ...over,
  };
}

function withBudget(jb: JarBudgetResult, overAllocated = false, jarRebalances: Transaction[] = []): Financials {
  return {
    jarBudget: jb,
    jarRebalances,
    jarEnvelope: {
      pending: { amount: 1_000_000, overAllocated: false, pool: 5_000_000, allocated: 4_000_000, meta: jb.meta },
      jars: [],
      meta: jb.meta,
    },
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

  it("U10: a failed jar load shows an ERROR state, never the 'Chưa có hũ nào' empty state", () => {
    jarState.error = "Failed to load jars";
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [])) };
    render(<BudgetTab />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Không tải được hũ chi tiêu")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có hũ nào")).not.toBeInTheDocument();
  });

  it("D24/U18: a jar covered back to 0 shows 'Đã bù', not 'Vượt hạn mức … Đã vượt'", () => {
    const covered = line({
      label: "Hưởng thụ", spent: 2_704_000, limit: 2_500_000, rebalanceNet: 204_000, effectiveLimit: 2_704_000,
      remaining: 0, pct: 1, status: "near", thresholdHit: true,
    });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [covered])) };
    render(<BudgetTab />);
    expect(screen.getByText("Đã bù vượt hạn mức")).toBeInTheDocument();
    expect(screen.getByText(/Đã bù 204\.000/)).toBeInTheDocument();
    expect(screen.queryByText("Vượt hạn mức")).not.toBeInTheDocument();
    expect(screen.queryByText("Đã vượt")).not.toBeInTheDocument();
    expect(screen.queryByText("Cần bù thủ công")).not.toBeInTheDocument();
  });

  it("U15: the 'Cần bù thủ công' notice carries an action that opens the allocation sheet", () => {
    const over = line({ spent: 4_500_000, remaining: -500_000, pct: 1.125, status: "over", thresholdHit: true });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [over])) };
    render(<BudgetTab />);
    expect(screen.getByText("Cần bù thủ công")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chia lại hạn mức" }));
    expect(screen.getByText("Đặt hạn mức cho hũ")).toBeInTheDocument();
  });

  it("U22: shows the rebalance adjustment so Hạn mức − Đã tiêu + Điều chỉnh = Vượt", () => {
    // 13.5M − 24.94M − 304k = −11.744M
    const jb = jarBudget(
      { totalLimit: 13_500_000, totalSpentSet: 24_940_000, totalRebalanceNet: -304_000, totalRemaining: -11_744_000, pctUsed: 1.85 },
      [line({})],
    );
    mockResult = { loading: false, error: false, financials: withBudget(jb) };
    render(<BudgetTab />);
    expect(screen.getByTestId("budget-rebalance-adjustment").textContent).toContain("Điều chỉnh hũ −304.000");
    expect(screen.getByText("Vượt")).toBeInTheDocument();
  });

  it("hides the adjustment line when no rebalance moved money out of the set jars", () => {
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [line({})])) };
    render(<BudgetTab />);
    expect(screen.queryByTestId("budget-rebalance-adjustment")).not.toBeInTheDocument();
  });
});
