import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { GoalProvider } from "@/state/goals";
import { CorrectionsProvider } from "@/state/corrections";
import { JarConfigProvider } from "@/state/jars";
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
        <JarConfigProvider>
          <AssetLiabilityProvider>
            <GoalProvider>
              <PeriodProvider>
                <OverviewTab onNavigate={() => {}} />
              </PeriodProvider>
            </GoalProvider>
          </AssetLiabilityProvider>
        </JarConfigProvider>
      </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("cockpit overflow guard", () => {
  it("renders a scroll-safe wrapper with all four tiles", async () => {
    renderOverview();

    // Wait for async provider load to resolve into the populated cockpit.
    await waitFor(() => expect(screen.getByTestId("cockpit-root")).toBeTruthy());

    const root = screen.getByTestId("cockpit-root");
    expect(root.className).toContain("min-h-full");
    expect(root.className).not.toContain("overflow-hidden");

    // All four cockpit questions must be present (compact, no scroll).
    for (const label of ["Dòng tiền tháng này", "Dự kiến cuối tháng", "Sắp phải trả", "Khả năng trang trải"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Tài sản ròng")).toBeTruthy();

    // Folded P04: the Tài sản & Nợ summary is present and drills to the manager.
    const summary = screen.getByLabelText("Mở Tài sản & Nợ");
    expect(summary).toHaveAttribute("href", "/pfm/wealth");

    expect(root.scrollHeight).toBeGreaterThanOrEqual(root.clientHeight);
  });

  /**
   * Worst-case content must still keep the overview itself compact enough to
   * enter the page; long record labels remain behind the wealth drill-down.
   */
  it("keeps the non-scrolling contract under a worst-case content fixture", async () => {
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
    for (const label of ["Dòng tiền tháng này", "Dự kiến cuối tháng", "Sắp phải trả", "Khả năng trang trải"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The Tài sản & Nợ summary stays a single drill row (no per-liability rows leak
    // onto the cockpit), so the long labels never enter this viewport.
    expect(screen.getByLabelText("Mở Tài sản & Nợ")).toHaveAttribute("href", "/pfm/wealth");
    expect(screen.queryByText(new RegExp(LONG_VN_NAME))).toBeNull();
  });
});
