import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
const router = { replace };
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock("../OverviewTab", () => ({ OverviewTab: () => <div>overview panel</div> }));
vi.mock("@/components/budget/BudgetTab", () => ({ BudgetTab: () => <div>budget panel</div> }));

import { PfmTabHost } from "../PfmTabHost";

/**
 * The wallet bottom nav (`PfmBottomNav`, in the layout) now owns tab selection via
 * `?tab=`; the host only reflects that param and resolves legacy ids forward. These
 * tests assert the host renders the right panel for a param and normalizes retired
 * ids so old deep links never dead-end (plan 260910-1626, invariant #3).
 */
describe("PfmTabHost — reflects ?tab= and resolves legacy ids", () => {
  beforeEach(() => {
    replace.mockClear();
    query = "";
  });

  it("defaults to the overview panel with no tab param", () => {
    render(<PfmTabHost />);
    expect(screen.getByText("overview panel")).toBeInTheDocument();
  });

  it("shows the budget panel for ?tab=budget", () => {
    query = "tab=budget";
    render(<PfmTabHost />);
    expect(screen.getByText("budget panel")).toBeInTheDocument();
  });

  it("normalizes legacy tab=hu to the budget tab", () => {
    query = "tab=hu";
    render(<PfmTabHost />);
    expect(screen.getByText("budget panel")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/pfm?tab=budget", { scroll: false });
  });

  it("normalizes the retired cashflow hũ dock to the budget tab", () => {
    query = "tab=cashflow&dock=hu";
    render(<PfmTabHost />);
    expect(screen.getByText("budget panel")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/pfm?tab=budget", { scroll: false });
  });

  it("normalizes legacy tab=cashflow to the overview tab", () => {
    query = "tab=cashflow";
    render(<PfmTabHost />);
    expect(screen.getByText("overview panel")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/pfm?tab=overview", { scroll: false });
  });

  it("keeps a visited panel mounted and restores its scroll", async () => {
    const { rerender } = render(<PfmTabHost />);
    const overview = document.getElementById("pfm-panel-overview") as HTMLDivElement;
    overview.scrollTop = 140;
    overview.dispatchEvent(new Event("scroll"));

    query = "tab=budget";
    rerender(<PfmTabHost />);
    await waitFor(() => expect(screen.getByText("budget panel")).toBeInTheDocument());
    expect(overview.hidden).toBe(true);
    expect(overview.textContent).toContain("overview panel");
    overview.scrollTop = 0;

    query = "";
    rerender(<PfmTabHost />);
    await waitFor(() => expect(screen.getByText("overview panel")).toBeInTheDocument());
    expect(document.getElementById("pfm-panel-overview")?.scrollTop).toBe(140);
  });
});
