import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useParams: () => ({ id: "goal1" }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock("@/lib/view-transition", () => ({ backWithTransition: (go: () => void) => go() }));
vi.mock("@/features/goals", async () => {
  const { GoalsHeader } = await import("@/features/goals/ui/GoalsHeader");
  return { GoalsHeader, GoalDetailScreen: () => <div>Goal detail</div> };
});
import GoalDetailPage from "../[id]/page";
import { PfmHeader } from "@/components/pfm/PfmHeader";

describe("PFM return navigation", () => {
  beforeEach(() => { nav.replace.mockClear(); nav.push.mockClear(); nav.query = ""; window.history.replaceState(null, "", "/"); });
  it("returns a goal opened from budget to budget without pushing another history entry", () => {
    nav.query = "from=budget";
    render(<GoalDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(nav.replace).toHaveBeenCalledWith("/pfm?tab=budget");
    expect(nav.push).not.toHaveBeenCalled();
  });
  it("returns a directly opened goal to the goals list", () => {
    render(<GoalDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(nav.replace).toHaveBeenCalledWith("/pfm?tab=goals");
  });
  it("ignores an unrecognized return destination", () => {
    nav.query = "from=https://example.com";
    render(<GoalDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(nav.replace).toHaveBeenCalledWith("/pfm?tab=goals");
  });
  it("returns jar management to budget rather than Home", () => {
    window.history.replaceState(null, "", "/pfm?tab=settings");
    render(<PfmHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(nav.replace).toHaveBeenCalledWith("/pfm?tab=budget", { scroll: false });
  });
});
