import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { PersonaProvider } from "@/providers/context";
import { CorrectionsProvider } from "@/state/corrections";
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
        <JarConfigProvider>
          <PeriodProvider>{ui}</PeriodProvider>
        </JarConfigProvider>
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
  });

  it("PFM jars setup (/pfm/jars)", async () => {
    const { default: Page } = await import("../pfm/jars/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("PFM cashflow (/pfm/cashflow) redirects to the host tab param", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../pfm/cashflow/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=cashflow");
  });

  it("PFM wealth (/pfm/wealth) redirects to the host tab param", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../pfm/wealth/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=wealth");
  });

  it("PFM insights (/pfm/insights) redirects to the host tab param", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../pfm/insights/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=insights");
  });

  it("Settings (/settings)", async () => {
    const { default: Page } = await import("../(festive)/settings/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Transfer confirm (/transfer-confirm)", async () => {
    const { TransferConfirm } = await import("../(festive)/transfer-confirm/TransferConfirm");
    expect(() => renderScreen(<TransferConfirm />)).not.toThrow();
  });

  it("Transfer compose (/transfer)", async () => {
    const { default: Page } = await import("../(festive)/transfer/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("legacy /cashflow redirects directly to /pfm?tab=cashflow", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../(festive)/cashflow/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=cashflow");
  });

  it("legacy /wealth redirects directly to /pfm?tab=wealth", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../(festive)/wealth/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=wealth");
  });
});

/**
 * Chrome-separation guards (plan 260908-pfm-chrome-redesign): the whole point of
 * the route-group split is that `/pfm/*` sheds the festive photo + 3-tab bottom
 * bar and gains a calm sub-app shell, while every other route keeps the festive
 * chrome. These assertions fail if PFM ever regains the bottom nav / festive bg,
 * or if the festive routes lose theirs.
 */
describe("chrome separation — PFM calm shell vs festive shell", () => {
  it("PFM: PfmHeader + 4 tabs, no BottomNav, no 2/9 festive bg", async () => {
    const { default: PfmLayout } = await import("../pfm/layout");
    const { default: PfmPage } = await import("../pfm/page");
    const { container } = renderScreen(
      <PfmLayout>
        <PfmPage />
      </PfmLayout>,
    );

    // Back-arrow sub-app header → Home
    expect(screen.getByLabelText("Về Trang chủ")).toHaveAttribute("href", "/");

    // The 4 segmented tabs are the sole PFM navigation
    const tablist = screen.getByRole("tablist", { name: "Phân mục PFM" });
    expect(within(tablist).getAllByRole("tab")).toHaveLength(4);
    for (const label of ["Tổng quan", "Dòng tiền", "Tài sản", "Gợi ý"]) {
      expect(within(tablist).getByText(label)).toBeInTheDocument();
    }

    // No 3-tab MSB bottom nav, no 2/9 festive photo background
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
