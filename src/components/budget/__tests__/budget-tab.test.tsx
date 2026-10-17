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
    momDelta: 400_000, momPct: 0.4, limit: 4_000_000, limitState: "set", rebalanceNet: 0, remaining: 2_600_000,
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

  it("hai trục: một hũ được bù đủ tiền vẫn báo vượt hạn mức, và nói rõ số dư đến từ đâu", () => {
    const covered = line({
      label: "Hưởng thụ", spent: 2_704_000, limit: 2_500_000, rebalanceNet: 204_000,
      remaining: 0, pct: 1.0816, status: "over", thresholdHit: true,
    });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [covered])) };
    render(<BudgetTab />);
    // Trục hạn mức: hạn mức GỐC 2.500.000 (không bị nâng lên 2.704.000) + verdict vượt.
    expect(screen.getByText(/2\.500\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/2\.704\.000 \//)).not.toBeInTheDocument();
    expect(screen.getByText("Vượt hạn mức")).toBeInTheDocument();
    expect(screen.getByText(/Đã vượt 204\.000/)).toBeInTheDocument();
    // Trục số dư: đã về 0 nhờ nhận từ hũ khác → không còn "cần bù thủ công".
    expect(screen.getByText("Số dư")).toBeInTheDocument();
    expect(screen.getByText(/Đã nhận 204\.000 ₫ từ hũ khác/)).toBeInTheDocument();
    expect(screen.queryByText("Cần bù thủ công")).not.toBeInTheDocument();
  });

  it("số dư hũ KHÔNG BAO GIỜ âm: một hũ tiêu quá số dư hiện 0 ₫, phần chưa bù nằm ở 'Cần bù thủ công'", () => {
    // limit 2tr, đã tiêu 2.5tr, mới nhận bù 200k → remaining −300k.
    // Hai con số PHẢI tách bạch: vượt kế hoạch 500k (spent − limit) vs chưa bù 300k (−remaining).
    const short = line({
      label: "Đi lại", spent: 2_500_000, limit: 2_000_000, rebalanceNet: 200_000,
      remaining: -300_000, pct: 1.25, status: "over", thresholdHit: true,
    });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [short])) };
    const { container } = render(<BudgetTab />);

    // Không một số tiền âm nào được render ở bất kỳ đâu trên thẻ hũ.
    expect(container.textContent).not.toMatch(/-\s?\d/);
    expect(screen.queryByText(/-300\.000/)).not.toBeInTheDocument();
    // Số dư bị chặn sàn ở 0 (giống JarEnvelopeCard ở Tổng quan).
    expect(screen.getByText("Số dư").textContent).toContain("0");
    // Phần chưa bù vẫn còn nguyên, đúng số, đúng nhãn trục SỐ DƯ.
    expect(screen.getByText("Cần bù thủ công")).toBeInTheDocument();
    expect(screen.getByText(/đã tiêu quá số dư 300\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/vượt hạn mức 300\.000/)).not.toBeInTheDocument();
    // Trục kế hoạch vẫn kể đúng câu chuyện của nó, bằng con số KHÁC.
    expect(screen.getByText(/Đã vượt 500\.000/)).toBeInTheDocument();
  });

  it("U15: the 'Cần bù thủ công' notice carries an action that opens the allocation sheet", () => {
    const over = line({ spent: 4_500_000, remaining: -500_000, pct: 1.125, status: "over", thresholdHit: true });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [over])) };
    render(<BudgetTab />);
    expect(screen.getByText("Cần bù thủ công")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chia lại hạn mức" }));
    expect(screen.getByText("Chia tiền vào hũ")).toBeInTheDocument();
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
