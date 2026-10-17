import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GoalCoachPanel } from "../GoalCoachPanel";

const coach = vi.hoisted(() => ({ reset: vi.fn(), phase: "need_info" }));
vi.mock("../../../client/hooks/use-goal-coach", () => ({ useGoalCoach: () => ({
  ...coach, turns: [{ role: "customer", text: "Mua xe" }], question: null, draft: null,
  answers: [], start: vi.fn(), answer: vi.fn(),
}) }));
beforeEach(() => { coach.reset.mockReset(); coach.phase = "need_info"; });

it("requires confirmation before resetting the conversation from the menu", async () => {
  render(<GoalCoachPanel onCreated={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Bắt đầu lại" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tùy chọn trò chuyện" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cuộc trò chuyện mới" }));
  expect(await screen.findByRole("dialog", { name: "Bắt đầu cuộc trò chuyện mới?" })).toBeInTheDocument();
  expect(coach.reset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục trò chuyện" }));
  expect(coach.reset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tùy chọn trò chuyện" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cuộc trò chuyện mới" }));
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu mới" }));
  expect(coach.reset).toHaveBeenCalledTimes(1);
});

it("hides the menu before a conversation begins", () => {
  coach.phase = "idle";
  render(<GoalCoachPanel onCreated={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Tùy chọn trò chuyện" })).not.toBeInTheDocument();
});
