import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { setConsent } from "@/lib/consent";
import { CashflowChartView } from "../CashflowChartView";

/**
 * Phase 03: the Dòng tiền chart view. Chips come from the full jar config so a
 * zero-spend jar still appears (red-team #11); the month's spending renders as a
 * category bar list with drill-to-`/transactions` affordances (red-team #3); and
 * the monthly report opens from an in-page CTA card (red-team #12), not a dock.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setConsent();
  push.mockClear();
});

function renderView() {
  return render(
    <PersonaProvider>
      <CorrectionsProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <AssetLiabilityProvider>
            <GoalProvider>
              <PeriodProvider>
                <CashflowChartView />
              </PeriodProvider>
            </GoalProvider>
          </AssetLiabilityProvider>
        </JarConfigProvider>
        </ManualTxnsProvider>
    </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("CashflowChartView", () => {
  it("renders jar filter chips from the full config, including the zero-spend Tiết kiệm jar", async () => {
    renderView();
    const chips = await screen.findByRole("group", { name: "Lọc theo hũ" });
    // "Tất cả" always leads; the default caNhan template's jars all appear —
    // including "Tiết kiệm" which has no categories/spend (red-team #11).
    expect(within(chips).getByText("Tất cả")).toBeInTheDocument();
    expect(within(chips).getByText("Tiết kiệm")).toBeInTheDocument();
    expect(within(chips).getByText("Ăn uống")).toBeInTheDocument();
  });

  it("shows the in-page monthly report CTA (not a dock)", async () => {
    renderView();
    expect(await screen.findByText("Xem báo cáo tháng")).toBeInTheDocument();
  });

  it("leads with a whole-period income, outflow, and net summary", async () => {
    renderView();
    expect(await screen.findByText("Thu vào")).toBeInTheDocument();
    expect(screen.getByText("Chi ra")).toBeInTheDocument();
    expect(screen.getByText("Chênh lệch")).toBeInTheDocument();
  });

  it("renders drillable category rows that push to /transactions?category=", async () => {
    renderView();
    // The reference persona has category spend in the current month → ≥1 row.
    const rows = await screen.findAllByRole("button", { name: /Xem giao dịch nhóm/ });
    rows[0].click();
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/transactions\?category=.*month=2026-09.*origin=cashflow/));
  });
});
