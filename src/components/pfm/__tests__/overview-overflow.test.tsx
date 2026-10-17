import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { GoalProvider } from "@/state/goals";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { JarConfigProvider } from "@/state/jars";
import { CategoryTaxonomyProvider } from "@/state/categories";
import { PeriodProvider } from "@/state/period";
import { setConsent } from "@/lib/consent";
import { getProviders } from "@/providers";
import type { Liability } from "@/domain/models";
import { OverviewTab } from "../OverviewTab";

/**
 * Overview layout guard. jsdom does not run layout (scrollHeight/clientHeight
 * are 0), so this asserts the structural contract: the content has a minimum
 * height and is allowed to grow instead of hiding the lower sections. Pixel
 * checks at the 320px/375px viewport floors remain manual visual QA.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
});

function renderOverview() {
  return render(
    <PersonaProvider>
      <CorrectionsProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <CategoryTaxonomyProvider>  
            <AssetLiabilityProvider>
                <GoalProvider>
                  <PeriodProvider>
                    <OverviewTab />
                  </PeriodProvider>
                </GoalProvider>
              </AssetLiabilityProvider>
          </CategoryTaxonomyProvider>
        </JarConfigProvider>
        </ManualTxnsProvider>
    </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("overview overflow guard", () => {
  it("renders a scroll-safe wrapper with the three thu-chi sections", async () => {
    renderOverview();

    // Wait for async provider load to resolve into the populated overview.
    await waitFor(() => expect(screen.getByTestId("cockpit-root")).toBeTruthy());

    const root = screen.getByTestId("cockpit-root");
    expect(root.className).toContain("min-h-full");
    expect(root.className).not.toContain("overflow-hidden");

    // The overview is exactly the three thu-chi sections — no wealth.
    for (const label of ["Tổng quan thu chi", "Báo cáo chi tiêu", "Biến động thu chi"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByLabelText("Tổng quan thu chi")).toBeTruthy();

    expect(root.scrollHeight).toBeGreaterThanOrEqual(root.clientHeight);
  });

  /**
   * Wealth/net-worth content lives on its own tab: even with heavy liability
   * fixtures loaded, the overview must not surface any of it (invariant: the
   * overview is income/expense only).
   */
  it("never leaks wealth content onto the income/expense overview", async () => {
    const LONG_VN_NAME =
      "Khoản vay mua nhà chung cư cao cấp khu đô thị phía Tây thành phố đợt hai"; // ~72 chars (< 80 cap)
    const provider = getProviders("stable");
    for (let i = 0; i < 12; i++) {
      const record: Liability = {
        id: `worst_liab_${i}`,
        type: "mortgage",
        name: `${LONG_VN_NAME} #${i}`.slice(0, 80),
        outstandingPrincipal: 9_500_000_000 + i, // large aggregate → many digits
        interestRate: 0.145,
        minimumPayment: 25_000_000,
        dueDate: null,
        remainingTerm: 240,
        source: "self_reported",
        lastUpdatedAt: "2026-09-09T00:00:00.000Z",
      };
      await provider.createLiability(record);
    }

    renderOverview();
    await waitFor(() => expect(screen.getByTestId("cockpit-root")).toBeTruthy());

    const root = screen.getByTestId("cockpit-root");
    expect(root.className).toContain("min-h-full");
    expect(root.className).not.toContain("overflow-hidden");
    for (const label of ["Tổng quan thu chi", "Báo cáo chi tiêu", "Biến động thu chi"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // No net-worth / wealth summary and no per-liability rows leak onto the overview.
    expect(screen.queryByText("Tài sản ròng")).toBeNull();
    expect(screen.queryByLabelText("Mở Tài sản & Nợ")).toBeNull();
    expect(screen.queryByText(new RegExp(LONG_VN_NAME))).toBeNull();
  });
});
