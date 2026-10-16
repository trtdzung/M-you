import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider, useJarConfig } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { setConsent } from "@/lib/consent";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/pfm",
  useSearchParams: () => new URLSearchParams(""),
}));

import { PfmOnboarding } from "../PfmOnboarding";
import PfmPage from "@/app/pfm/page";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  window.localStorage.clear();
  setConsent();
});

function Providers({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <CorrectionsProvider>
        <ManualTxnsProvider>
          <JarConfigProvider>
            <AssetLiabilityProvider>
              <GoalProvider>
                <PeriodProvider>{children}</PeriodProvider>
              </GoalProvider>
            </AssetLiabilityProvider>
          </JarConfigProvider>
        </ManualTxnsProvider>
      </CorrectionsProvider>
    </PersonaProvider>
  );
}

/** Probe that surfaces the seeded jar set so the seed can be asserted. */
function JarProbe() {
  const { config } = useJarConfig();
  return (
    <ul data-testid="jars">
      {config.jars.map((j) => (
        <li key={j.id}>{j.label}</li>
      ))}
    </ul>
  );
}

/**
 * Phase 07 onboarding. The setup screen must seed the CHOSEN template (not just
 * the default) into the live jar config, and the CTA must signal completion so
 * the first-run gate can hand off to the tab host.
 */
describe("PfmOnboarding", () => {
  it("lists the three seed templates with jar chips", async () => {
    render(<PfmOnboarding onComplete={vi.fn()} />, { wrapper: Providers });
    expect(screen.getByRole("radio", { name: /Cá nhân/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Gia đình/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Kinh doanh/ })).toBeInTheDocument();
  });

  it("seeds the chosen template and calls onComplete on 'Bắt đầu'", async () => {
    const onComplete = vi.fn();
    render(
      <>
        <PfmOnboarding onComplete={onComplete} />
        <JarProbe />
      </>,
      { wrapper: Providers },
    );

    // Let the provider's async config load settle first, so the seed mutation
    // below wins instead of being overwritten by the mount load resolving late.
    await act(async () => {
      await Promise.resolve();
    });

    // Pick Gia đình (4 jars) over the default Cá nhân (6 jars).
    fireEvent.click(screen.getByRole("radio", { name: /Gia đình/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const items = screen.getByTestId("jars").querySelectorAll("li");
      // Gia đình seeds 4 jars, every expense category covered (no orphan "Khác").
      expect(items.length).toBe(4);
    });
    expect(screen.getByTestId("jars")).toHaveTextContent("Ăn uống & sức khỏe");
  });
});

/**
 * First-run gate: `useOnboarded` reads a dedicated localStorage flag (config
 * always exists because the provider seeds it), so the page shows setup on first
 * run and the tab host once the flag is set.
 */
describe("PFM first-run gate", () => {
  it("shows onboarding when the flag is absent", async () => {
    render(<PfmPage />, { wrapper: Providers });
    await waitFor(() =>
      expect(screen.getByText("Thiết lập ví của bạn")).toBeInTheDocument(),
    );
  });

  it("skips onboarding once the flag is set", async () => {
    window.localStorage.setItem("msb-pfm.onboarded", "1");
    render(<PfmPage />, { wrapper: Providers });
    await waitFor(() =>
      expect(screen.queryByText("Thiết lập ví của bạn")).toBeNull(),
    );
  });
});
