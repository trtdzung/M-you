import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CategoryTaxonomyProvider } from "@/state/categories";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { setConsent } from "@/lib/consent";

/**
 * Route smoke tests (Red Team #7): every screen in the 3-tab MSB IA must mount
 * without throwing, using the real providers + mock data. This guards the
 * information-architecture refactor (Home / Tài khoản / PFM + sub-routes) against
 * a page crashing on render. `next/navigation` is stubbed since jsdom has no
 * router; redirect routes assert they call `redirect()`.
 */

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...args),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("draftId=demo"),
  useParams: () => ({ id: "acc-current" }),
}));

// Recharts' ResponsiveContainer needs ResizeObserver (absent in jsdom).
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
  setConsent(); // grant full consent so data-backed screens render
});

function renderScreen(ui: ReactElement) {
  return render(
    <PersonaProvider>
      <CorrectionsProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <CategoryTaxonomyProvider>
            <AssetLiabilityProvider>
              <GoalProvider>
                <PeriodProvider>{ui}</PeriodProvider>
              </GoalProvider>
            </AssetLiabilityProvider>
          </CategoryTaxonomyProvider>
        </JarConfigProvider>
        </ManualTxnsProvider>
    </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("route smoke — all screens mount", () => {
  it("Home (/)", async () => {
    const { default: Page } = await import("../(festive)/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Accounts (/accounts)", async () => {
    const { default: Page } = await import("../(festive)/accounts/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Account detail (/accounts/[id])", async () => {
    const { default: Page } = await import("../(festive)/accounts/[id]/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Transactions (/transactions)", async () => {
    const { default: Page } = await import("../(festive)/transactions/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("PFM hub (/pfm)", async () => {
    const { default: Page } = await import("../pfm/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  }, 20_000); // mounts the chart-heavy overview tab directly (no setup gate); give it headroom under parallel load

  it("PFM jars setup (/pfm/jars) redirects to the Ngân sách tab", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../pfm/jars/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=budget");
  });

  it("PFM cashflow (/pfm/cashflow) redirects to the overview tab", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../pfm/cashflow/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=overview");
  });

  it("PFM wealth (/pfm/wealth) mounts the Tài sản & Nợ manager", async () => {
    const { default: Page } = await import("../pfm/wealth/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
    expect(screen.getByRole("heading", { name: "Tài sản & Nợ" })).toBeInTheDocument();
  });

  it("Settings (/settings)", async () => {
    const { default: Page } = await import("../(festive)/settings/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Transfer confirm (/transfer-confirm)", async () => {
    const { TransferConfirm } = await import("../transfer-confirm/TransferConfirm");
    expect(() => renderScreen(<TransferConfirm />)).not.toThrow();
  });

  it("Transfer compose (/transfer)", async () => {
    const { default: Page } = await import("../transfer/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("legacy /cashflow redirects directly to /pfm?tab=overview", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../(festive)/cashflow/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=overview");
  });

  it("legacy /wealth redirects to the /pfm/wealth manager", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../(festive)/wealth/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm/wealth");
  });
});

/**
 * Chrome-separation guards. Plan 260910-1626 (BIDV wallet reformat) SUPERSEDES the
 * no-bottom-nav decision of plan 260908: `/pfm/*` now carries its OWN wallet bottom
 * nav (4 tabs + center ＋ FAB) — distinct from the festive 3-tab "Điều hướng chính"
 * bar — while keeping the calm sub-app shell (back-arrow header, no festive photo).
 * Every other route keeps the festive chrome. These assertions fail if PFM loses
 * its wallet nav, regains the festive nav/bg, or if festive routes lose theirs.
 */
describe("chrome separation — PFM wallet shell vs festive shell", () => {
  it("PFM: PfmHeader + own 4-tab wallet nav + ＋ FAB, no festive nav/bg", async () => {
    const { default: PfmLayout } = await import("../pfm/layout");
    const { default: PfmPage } = await import("../pfm/page");
    const { container } = renderScreen(
      <PfmLayout>
        <PfmPage />
      </PfmLayout>,
    );

    // Back-arrow sub-app header → Home
    expect(screen.getByLabelText("Về Trang chủ")).toHaveAttribute("href", "/");

    // The 4-tab wallet bottom nav is the sole PFM navigation (supersedes 260908)
    const nav = screen.getByRole("navigation", { name: "Điều hướng PFM" });
    for (const label of ["Tổng quan", "Giao dịch", "Ngân sách", "Cài đặt"]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    // Center mic FAB opens the voice quick-action panel (Feature 5) — never
    // moves money itself, only ever hands off to a real, human-confirmed flow
    // (invariant #3). Retired the earlier "Thêm giao dịch" FAB entirely.
    expect(within(nav).getByLabelText("Giữ để hỏi M-You bằng giọng nói")).toBeInTheDocument();

    // Distinct from the festive 3-tab bar; no 2/9 festive photo background
    expect(screen.queryByLabelText("Điều hướng chính")).toBeNull();
    expect(container.innerHTML).not.toContain("bg-2-9");
  });

  it("Festive: BottomNav + 2/9 festive bg still present (regression guard)", async () => {
    const { default: FestiveLayout } = await import("../(festive)/layout");
    const { container } = renderScreen(
      <FestiveLayout>
        <div />
      </FestiveLayout>,
    );

    expect(screen.getByLabelText("Điều hướng chính")).toBeInTheDocument();
    expect(container.innerHTML).toContain("bg-2-9");
  });
});
