import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Financials } from "@/domain/engine/finance-compose";
import type { JarBudgetResult } from "@/domain/engine/jar-budget";
import { monthPeriod } from "@/domain/engine/types";
import type { Transaction } from "@/domain/models";
import { currentMonthKey } from "@/lib/demo-clock";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(""),
}));

let mockResult: { loading: boolean; error: boolean; financials: Financials | null };
vi.mock("@/state/useFinancials", () => ({ useFinancials: () => mockResult }));
vi.mock("@/components/common/PeriodPicker", () => ({ PeriodPicker: () => <div>period</div> }));
// Jar config state: `error` is non-null when GET /api/jars failed (U10).
// The allocation sheet writes ONE atomic ledger batch via `postLedger`.
let jarState: {
  config: { version: 3; jars: [] };
  error: string | null;
  postLedger: () => Promise<boolean>;
  mutationError: string | null;
};
vi.mock("@/state/jars", () => ({ useJarConfig: () => jarState }));
beforeEach(() => {
  jarState = { config: { version: 3, jars: [] }, error: null, postLedger: vi.fn().mockResolvedValue(true), mutationError: null };
});

import { BudgetTab } from "../BudgetTab";

/** The PressureRow caption ("Đã chi Y / Z hạn mức") spans several <Money> nodes. */
const gauge = (re: RegExp) => (_: string, el: Element | null) =>
  el?.tagName === "SPAN" && el.childNodes[0]?.textContent === "Đã chi " && re.test(el.textContent ?? "");

const JUNE = monthPeriod(2026, 5);

function jarBudget(over: Partial<JarBudgetResult["summary"]>, lines: JarBudgetResult["lines"]): JarBudgetResult {
  return {
    lines,
    summary: {
      totalLimit: 5_000_000,
      totalSpent: 2_400_000,
      totalSpentSet: 2_400_000,
      totalRebalanceNet: 0,
      totalBalance: 2_600_000,
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
    momDelta: 400_000, momPct: 0.4, limit: 4_000_000, limitState: "set", rebalanceNet: 0, balance: 2_600_000,
    pct: 0.35, status: "ok", thresholdHit: false, source: "mock", freshness: null, ...over,
  };
}

function withBudget(
  jb: JarBudgetResult,
  overAllocated = false,
  jarRebalances: Transaction[] = [],
  monthKey = currentMonthKey(),
): Financials {
  return {
    monthKey,
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
    const unset = line({ huId: "savings", label: "Tiết kiệm", categoryIds: [], limit: null, limitState: "unset", balance: null, pct: null, status: null, spent: 0 });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [line({}), unset])) };
    render(<BudgetTab />);
    expect(screen.getByText("Chưa đặt hạn mức")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt hạn mức" })).toBeInTheDocument();
  });

  it("shows a 'Chưa đặt' gauge when no jar has a limit (unknown, not 0%)", () => {
    const unset = line({ limit: null, limitState: "unset", balance: null, pct: null, status: null, spent: 0 });
    mockResult = {
      loading: false, error: false,
      financials: withBudget(jarBudget({ totalLimit: null, totalBalance: null, pctUsed: null, totalSpentSet: 0 }, [unset])),
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

  it("hai trục: một hũ được bù đủ tiền vẫn báo vượt hạn mức; khoản điều chỉnh hũ không liệt kê trên thẻ", () => {
    const covered = line({
      label: "Hưởng thụ", spent: 2_704_000, limit: 2_500_000, rebalanceNet: 204_000,
      balance: 0, pct: 1.0816, status: "over", thresholdHit: true,
    });
    const leg = {
      id: "rb-1", postedAt: "2026-09-12T03:00:00.000Z", amount: 204_000, categoryId: "dieu-chinh-hu",
      rebalance: { fromJarId: "pool", toJarId: covered.huId, triggerTxnId: "t", origin: "auto" },
    } as unknown as Transaction;
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [covered]), false, [leg]) };
    render(<BudgetTab />);
    // Trục hạn mức: hạn mức GỐC 2.500.000 (không bị nâng lên 2.704.000) + verdict vượt.
    expect(screen.getByText(/2\.500\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/2\.704\.000 \//)).not.toBeInTheDocument();
    expect(screen.getByText("Vượt hạn mức")).toBeInTheDocument();
    expect(screen.getByText(/Đã vượt 204\.000/)).toBeInTheDocument();
    // Trục số dư: đã về 0 nhờ nhận từ hũ khác → không còn "cần bù thủ công".
    expect(screen.getByText("Số dư")).toBeInTheDocument();
    // Khoản chuyển giữa hũ chỉ hiện ở tab Giao dịch ("Điều chỉnh hũ"), không lặp lại trên thẻ.
    expect(screen.queryByText(/từ hũ khác|sang hũ khác/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nhận từ|Chuyển sang/)).not.toBeInTheDocument();
    expect(screen.queryByText("Cần bù thủ công")).not.toBeInTheDocument();
  });

  it("số dư âm hiện ĐÚNG là âm (text-negative), phần chưa bù nằm ở 'Cần bù thủ công'", () => {
    // limit 2tr, đã tiêu 2.5tr, mới nhận bù 200k → balance −300k.
    // Hai con số PHẢI tách bạch: vượt kế hoạch 500k (spent − limit) vs chưa bù 300k (−balance).
    const short = line({
      label: "Đi lại", spent: 2_500_000, limit: 2_000_000, rebalanceNet: 200_000,
      balance: -300_000, pct: 1.25, status: "over", thresholdHit: true,
    });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [short])) };
    render(<BudgetTab />);

    // Plan 260923: số dư là tiền thật trong hũ — hết tiền thì hiện âm, không chặn sàn 0
    // (giống JarEnvelopeCard ở Tổng quan).
    const balance = screen.getByText(/-300\.000/);
    expect(balance).toHaveClass("text-negative");
    expect(screen.getByText(/^Số dư/).textContent).toMatch(/-300\.000/);
    // Phần chưa bù vẫn còn nguyên, đúng số, đúng nhãn trục SỐ DƯ.
    expect(screen.getByText("Cần bù thủ công")).toBeInTheDocument();
    expect(screen.getByText(/đã tiêu quá số dư 300\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/vượt hạn mức 300\.000/)).not.toBeInTheDocument();
    // Trục kế hoạch vẫn kể đúng câu chuyện của nó, bằng con số KHÁC.
    expect(screen.getByText(/Đã vượt 500\.000/)).toBeInTheDocument();
  });

  it("U15: the 'Cần bù thủ công' notice carries an action that opens the allocation sheet", () => {
    const over = line({ spent: 4_500_000, balance: -500_000, pct: 1.125, status: "over", thresholdHit: true });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [over])) };
    render(<BudgetTab />);
    expect(screen.getByText("Cần bù thủ công")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nạp thêm vào hũ" }));
    expect(screen.getByText("Chia tiền vào hũ")).toBeInTheDocument();
  });

  it("U22: shows the rebalance adjustment line and a negative 'Tổng số dư' in text-negative", () => {
    // 13.5M − 24.94M − 304k = −11.744M
    const jb = jarBudget(
      { totalLimit: 13_500_000, totalSpentSet: 24_940_000, totalRebalanceNet: -304_000, totalBalance: -11_744_000, pctUsed: 1.85 },
      [line({})],
    );
    mockResult = { loading: false, error: false, financials: withBudget(jb) };
    render(<BudgetTab />);
    expect(screen.getByTestId("budget-rebalance-adjustment").textContent).toContain("Điều chỉnh hũ −304.000");
    expect(screen.getByText("Tổng số dư")).toBeInTheDocument();
    const total = screen.getByText(/-11\.744\.000/);
    expect(total).toHaveClass("text-negative");
  });

  it("Case A: limit 7tr, deposited 7tr, spent 3tr → 'Đã chi 3.000.000 / 7.000.000 hạn mức' and Số dư 4.000.000", () => {
    const a = line({ spent: 3_000_000, limit: 7_000_000, balance: 4_000_000, pct: 3 / 7 });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [a])) };
    render(<BudgetTab />);
    expect(screen.getByText(gauge(/^Đã chi 3\.000\.000\s₫ \/ 7\.000\.000\s₫ hạn mức$/))).toBeInTheDocument();
    expect(screen.getByText(/^Số dư/).textContent).toMatch(/4\.000\.000/);
  });

  it("a jar without a balance offers 'Chia ngay' in the current month", () => {
    const unfunded = line({ balance: null, spent: 0, pct: 0 });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [unfunded])) };
    render(<BudgetTab />);
    expect(screen.getByText("Chưa có số dư")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chia ngay" }));
    expect(screen.getByText("Chia tiền vào hũ")).toBeInTheDocument();
  });

  it("Red Team #2: a past month shows the figures but NO funding actions", () => {
    const short = line({ spent: 4_500_000, balance: -500_000, pct: 1.125, status: "over", thresholdHit: true });
    const preAnchor = line({ huId: "bills", label: "Hóa đơn", balance: null, spent: 800_000, pct: 0.2 });
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [short, preAnchor]), false, [], "2026-01") };
    render(<BudgetTab />);
    // Pre-anchor month: "Chưa có số dư", but Đã chi / hạn mức stay visible.
    expect(screen.getByText("Chưa có số dư")).toBeInTheDocument();
    expect(screen.getByText(gauge(/^Đã chi 800\.000\s₫ \/ 4\.000\.000\s₫ hạn mức$/))).toBeInTheDocument();
    expect(screen.getByText("Cần bù thủ công")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nạp thêm vào hũ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chia ngay" })).not.toBeInTheDocument();
  });

  it("hides the adjustment line when no rebalance moved money out of the set jars", () => {
    mockResult = { loading: false, error: false, financials: withBudget(jarBudget({}, [line({})])) };
    render(<BudgetTab />);
    expect(screen.queryByTestId("budget-rebalance-adjustment")).not.toBeInTheDocument();
  });
});
