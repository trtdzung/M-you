import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { CategoryMemoryProvider } from "@/state/category-memory";
import { AutoCategorizeProvider } from "@/state/auto-categorize";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider } from "@/state/jars";
import { JarAllocationsProvider } from "@/state/jar-allocations";
import { PeriodProvider } from "@/state/period";
import { setConsent } from "@/lib/consent";
import { PfmTxnList } from "../PfmTxnList";

/**
 * Component-level coverage of the auto-categorize accept flow, through the
 * full real provider stack against the seeded "stable" persona (matching the
 * pattern in `PfmTxnList.test.tsx`) — no fabricated transactions.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
});

function renderList() {
  return render(
    <PersonaProvider>
      <CorrectionsProvider>
        <CategoryMemoryProvider>
          <ManualTxnsProvider>
            <JarConfigProvider>
              <JarAllocationsProvider>
                <AssetLiabilityProvider>
                  <GoalProvider>
                    <PeriodProvider>
                      <AutoCategorizeProvider>
                        <PfmTxnList />
                      </AutoCategorizeProvider>
                    </PeriodProvider>
                  </GoalProvider>
                </AssetLiabilityProvider>
              </JarAllocationsProvider>
            </JarConfigProvider>
          </ManualTxnsProvider>
        </CategoryMemoryProvider>
      </CorrectionsProvider>
    </PersonaProvider>,
  );
}

async function waitForLoaded(container: HTMLElement) {
  await waitFor(() => expect(container.querySelectorAll("section").length).toBeGreaterThan(0));
}

describe("Auto-categorize accept flow ('ai' consent granted)", () => {
  beforeEach(() => {
    // Grant "ai" so the local heuristic (Red Team #9: origin "heuristic", NEVER
    // presented as AI) runs and produces low-confidence pending suggestions.
    setConsent(["transactions", "assets", "liabilities", "ai"]);
  });

  it("surfaces a pending heuristic suggestion and lets the user accept it", async () => {
    const { container } = renderList();
    await waitForLoaded(container);

    // Auto-backfill is debounced ~500ms.
    await waitFor(
      () => expect(screen.getAllByText(/Gợi ý tự động/).length).toBeGreaterThan(0),
      { timeout: 3000 },
    );

    // A local heuristic must never masquerade as AI (Red Team #9).
    expect(screen.queryByText(/AI gợi ý/)).toBeNull();
    // No raw confidence number is ever shown to the user (Red Team #15).
    expect(container.textContent).not.toMatch(/\d+\s*%/);

    const badgeCountBefore = screen.getAllByText(/Gợi ý tự động/).length;
    const acceptButtons = screen.getAllByRole("button", { name: "Đồng ý" });
    expect(acceptButtons.length).toBeGreaterThan(0);
    const firstAccept = acceptButtons[0];

    fireEvent.click(firstAccept);

    // The accepted row's pending suggestion (button + badge) disappears —
    // it is now a confirmed user correction, not a pending guess.
    await waitFor(() => expect(firstAccept).not.toBeInTheDocument());
    expect(screen.queryAllByText(/Gợi ý tự động/).length).toBe(badgeCountBefore - 1);

    // Persisted as a real "user" correction under the per-cif key.
    const raw = window.localStorage.getItem("msb-pfm.corrections.CIF_0001");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as Record<string, { categoryId?: string; origin?: string }>;
    expect(Object.values(parsed).some((c) => c.origin === "user" && !!c.categoryId)).toBe(true);
  });
});

describe("Auto-categorize consent gate (no 'ai' scope — memory-only)", () => {
  it("never calls the remote categorize endpoint and shows no auto-suggested badge without 'ai' consent", async () => {
    setConsent(["transactions"]);
    // Wrap real fetch (the app's own JarConfig/JarAllocations providers fetch
    // their own same-origin routes regardless of AI consent — that's expected
    // and unrelated) so we can isolate calls to the categorize endpoint only.
    const realFetch = global.fetch;
    const fetchSpy = vi.fn((...args: Parameters<typeof fetch>) => realFetch(...args));
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const { container } = renderList();
      await waitForLoaded(container);

      // Give the debounced backfill effect a full window to (not) fire.
      await new Promise((resolve) => setTimeout(resolve, 700));

      const categorizeCalls = fetchSpy.mock.calls.filter((args) => String(args[0]).includes("categorize"));
      expect(categorizeCalls).toHaveLength(0);
      expect(screen.queryByText(/Gợi ý tự động/)).toBeNull();
      expect(screen.queryByText(/AI gợi ý/)).toBeNull();
      // The bar explains AI is off and only previously-taught labels apply.
      expect(screen.getByText(/Trợ lý AI đang tắt/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
