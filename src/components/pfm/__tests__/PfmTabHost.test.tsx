import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const replace = vi.fn();
const router = { replace };
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock("../OverviewTab", () => ({ OverviewTab: () => <div>overview panel</div> }));
vi.mock("../HuTab", () => ({ HuTab: () => <div>hu panel</div> }));
vi.mock("@/components/cashflow/CashflowChartView", () => ({ CashflowChartView: () => <div>cashflow panel</div> }));

import { PfmTabHost } from "../PfmTabHost";

describe("PfmTabHost navigation", () => {
  beforeEach(() => {
    replace.mockClear();
    query = "";
  });

  it("keeps the selected tab in the URL without adding history", () => {
    render(<PfmTabHost />);

    fireEvent.click(screen.getByRole("tab", { name: "Hũ" }));

    expect(replace).toHaveBeenCalledWith("/pfm?tab=hu", { scroll: false });
    expect(screen.getByText("hu panel")).toBeInTheDocument();
  });

  it("normalizes the retired cashflow hũ dock to the Hũ tab", () => {
    query = "tab=cashflow&dock=hu";
    render(<PfmTabHost />);

    expect(replace).toHaveBeenCalledWith("/pfm?tab=hu", { scroll: false });
    expect(screen.getByText("hu panel")).toBeInTheDocument();
  });
});
