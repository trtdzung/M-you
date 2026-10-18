import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import HomePage from "@/app/(festive)/page";
const state = vi.hoisted(() => ({ provider: { listAccounts: vi.fn() } }));
vi.mock("@/providers/context", () => ({ useProviders: () => state.provider }));
vi.mock("./HomeInsightWidget", () => ({ HomeInsightWidget: () => <div>Gợi ý tài chính</div> }));
vi.mock("@/components/primitives", () => ({ SourceBadge: () => null }));

describe("Home loading", () => {
  it("shows shortcuts and banners before the account request finishes", async () => {
    let resolve!: (accounts: unknown[]) => void;
    state.provider.listAccounts.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "Chuyển tiền" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "PFM" })).toBeTruthy();
    expect(screen.getByAltText(/Cùng tài khoản MSB/)).toBeTruthy();
    expect(screen.queryByText("Chưa có tài khoản")).toBeNull();
    await act(async () => resolve([]));
    expect(screen.getByText("Chưa có tài khoản")).toBeTruthy();
  });
});
