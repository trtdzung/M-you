import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_AGENT_PREFERENCES } from "@/domain/models";

const remove = vi.fn();
let memoryState: { records: { id: string; fact: string; created_at: string | null }[]; status: string };

vi.mock("@/state/agent-preferences", () => ({
  useAgentPreferences: () => ({
    preferences: EMPTY_AGENT_PREFERENCES,
    status: "ready",
    save: vi.fn(),
    reload: vi.fn(),
  }),
}));
vi.mock("@/state/agent-memory", () => ({
  useAgentMemory: () => ({ ...memoryState, remove, reload: vi.fn() }),
}));

import { AgentPreferencesSheet } from "../AgentPreferencesSheet";

describe("AgentPreferencesSheet — what M-You remembered", () => {
  beforeEach(() => {
    remove.mockReset().mockResolvedValue(undefined);
    memoryState = { records: [], status: "ready" };
  });

  it("lists each remembered fact as plain text", () => {
    memoryState = {
      status: "ready",
      records: [
        { id: "r1", fact: "Khách dự kiến chi đám cưới 200.000.000 VND", created_at: null },
        { id: "r2", fact: "<b>thích đá banh</b>", created_at: null },
      ],
    };
    render(<AgentPreferencesSheet onClose={() => {}} />);
    expect(screen.getByText("M-You đã ghi nhớ")).toBeInTheDocument();
    expect(screen.getByText("Khách dự kiến chi đám cưới 200.000.000 VND")).toBeInTheDocument();
    // free text from the agent is never rendered as HTML
    expect(screen.getByText("<b>thích đá banh</b>")).toBeInTheDocument();
  });

  it("shows an empty message when nothing is remembered", () => {
    render(<AgentPreferencesSheet onClose={() => {}} />);
    expect(screen.getByText(/chưa ghi nhớ điều gì/i)).toBeInTheDocument();
  });

  it("deletes a fact through the hook when its delete button is pressed", async () => {
    memoryState = { status: "ready", records: [{ id: "r1", fact: "thích đá banh", created_at: null }] };
    render(<AgentPreferencesSheet onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /xóa.*thích đá banh/i }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("r1"));
  });

  it("shows an error and keeps the row when the delete fails", async () => {
    remove.mockRejectedValue(new Error("boom"));
    memoryState = { status: "ready", records: [{ id: "r1", fact: "thích đá banh", created_at: null }] };
    render(<AgentPreferencesSheet onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /xóa.*thích đá banh/i }));
    expect(await screen.findByText(/không xóa được/i)).toBeInTheDocument();
    expect(screen.getByText("thích đá banh")).toBeInTheDocument();
  });
});
