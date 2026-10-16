import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { CorrectionsProvider } from "@/state/corrections";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { setConsent } from "@/lib/consent";
import { OverviewTab } from "../OverviewTab";

/**
 * Red Team M3: automated overflow guard for the no-scroll cockpit. jsdom does
 * not run layout (scrollHeight/clientHeight are 0), so this asserts the
 * structural contract — the fixed-height, overflow-hidden wrapper renders with
 * every required tile — and checks scrollHeight ≤ clientHeight so a future real
 * layout engine (or a regression that forces a min-height) is caught. The
 * pixel-accurate no-scroll pass at the 375×667 floor is the manual QA (Phase 04).
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
          <PeriodProvider>
            <OverviewTab onNavigate={() => {}} />
          </PeriodProvider>
        </JarConfigProvider>
      </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("cockpit overflow guard", () => {
  it("renders the fixed-height, non-scrolling wrapper with all four tiles", async () => {
    renderOverview();

    // Wait for async provider load to resolve into the populated cockpit.
    await waitFor(() => expect(screen.getByTestId("cockpit-root")).toBeTruthy());

    const root = screen.getByTestId("cockpit-root");
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).toContain("h-full");

    // All four cockpit questions must be present (compact, no scroll).
    for (const label of ["Dòng tiền tháng", "Cuối tháng", "Sắp phải trả", "Sức khỏe"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Tài sản ròng")).toBeTruthy();

    // No overflow (trivially true in jsdom; guards a real layout regression).
    expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight);
  });
});
