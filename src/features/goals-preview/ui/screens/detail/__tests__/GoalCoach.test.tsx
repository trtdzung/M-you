import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { resetGoalInsights, syncGoalInsights } from "../../../../client/goal-insight-store";
import { GoalCoach } from "../GoalCoach";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const card = { goalName: "Mua xe", observation: "Bạn đang đi chậm.", suggestion: "Gửi thêm.", question: "Mình nên gửi thêm thế nào?" };
const ui = () => render(<PersonaProvider><GoalCoach goalId="goal-1" goalName="Mua xe" /></PersonaProvider>);
const reply = (body: unknown) => new Response(JSON.stringify(body));

afterEach(() => { resetGoalInsights(); vi.restoreAllMocks(); });

describe("GoalCoach", () => {
  it("chưa có thẻ mà đang nạp: hiện ô giữ chỗ 'M-You đang xem xét…', có thẻ thì thay bằng thẻ", async () => {
    let answer!: (r: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    ui();
    await act(async () => syncGoalInsights("CIF_0001"));
    expect(screen.getByText("M-You đang xem xét mục tiêu của bạn…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chi tiết/ })).not.toBeInTheDocument();

    await act(async () => answer(reply({ insights: { "goal-1": card }, refreshing: false })));
    await waitFor(() => expect(screen.getByText("Bạn đang đi chậm.")).toBeInTheDocument());
    expect(screen.queryByText(/đang xem xét/)).not.toBeInTheDocument();
  });

  it("hết chờ mà agent không có thẻ: ẩn cả ô", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ insights: { "goal-1": null }, refreshing: false }));
    const { container } = ui();
    await act(async () => syncGoalInsights("CIF_0001"));
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });
});
