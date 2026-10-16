import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { PersonaProvider } from "@/providers/context";
import { CorrectionsProvider } from "@/state/corrections";
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
        <PeriodProvider>{ui}</PeriodProvider>
      </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("route smoke — all screens mount", () => {
  it("Home (/)", async () => {
    const { default: Page } = await import("../page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Accounts (/accounts)", async () => {
    const { default: Page } = await import("../accounts/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Account detail (/accounts/[id])", async () => {
    const { default: Page } = await import("../accounts/[id]/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Transactions (/transactions)", async () => {
    const { default: Page } = await import("../transactions/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("PFM hub (/pfm)", async () => {
    const { default: Page } = await import("../pfm/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("PFM cashflow (/pfm/cashflow)", async () => {
    const { default: Page } = await import("../pfm/cashflow/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("PFM wealth (/pfm/wealth)", async () => {
    const { default: Page } = await import("../pfm/wealth/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("PFM insights (/pfm/insights)", async () => {
    const { default: Page } = await import("../pfm/insights/page");
    expect(() => renderScreen(<Page />)).not.toThrow();
  });

  it("Settings (/settings)", async () => {
    const { default: Page } = await import("../settings/page");
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

  it("legacy /cashflow redirects to /pfm/cashflow", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../cashflow/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm/cashflow");
  });

  it("legacy /wealth redirects to /pfm/wealth", async () => {
    redirect.mockClear();
    const { default: Page } = await import("../wealth/page");
    Page();
    expect(redirect).toHaveBeenCalledWith("/pfm/wealth");
  });
});
