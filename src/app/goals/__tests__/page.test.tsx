import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GoalsPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

describe("/goals page", () => {
  it("shows the title and the empty state", () => {
    render(<GoalsPage />);
    expect(screen.getByRole("heading", { name: "Mục tiêu" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có mục tiêu nào")).toBeInTheDocument();
    expect(
      screen.getByText("Tạo mục tiêu đầu tiên để bắt đầu tích lũy."),
    ).toBeInTheDocument();
  });
});
