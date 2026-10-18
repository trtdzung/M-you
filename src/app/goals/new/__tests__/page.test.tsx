import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreateGoalPage from "../page";
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/features/goals/ui/screens/CreateGoalFlow", () => ({ CreateGoalFlow: ({ onCreated }: { onCreated: (id: string) => void }) => <button onClick={() => onCreated("saved-id")}>Lưu mục tiêu kiểm thử</button> }));
describe("create goal page", () => {
  it("has one header, returns to goals, and opens the saved detail after creation", () => {
    render(<CreateGoalPage />);
    expect(screen.getAllByRole("heading", { name: "Tạo mục tiêu" })).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(nav.replace).toHaveBeenCalledWith("/pfm?tab=goals");
    fireEvent.click(screen.getByRole("button", { name: "Lưu mục tiêu kiểm thử" }));
    expect(nav.replace).toHaveBeenCalledWith("/goals/saved-id");
  });
});
