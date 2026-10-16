import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { MYourWidget } from "../MYourWidget";
import * as agentApi from "@/lib/agent-api";

/**
 * The floating M-Your chat button lives on every /pfm screen (mounted via the
 * PhoneShell `fab` slot). It is wired to the real agent (`src/lib/agent-api.ts`)
 * — opening the overlay loads real history and gates the composer until that
 * finishes; sending/deleting call the real endpoints. `cif` comes from the
 * default persona (`stable` → `CIF_0001`) via a real `PersonaProvider`.
 */
function renderWidget() {
  return render(
    <PersonaProvider>
      <MYourWidget />
    </PersonaProvider>,
  );
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý M-Your" }));
}

beforeEach(() => {
  vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({ thread_id: "CIF_0001", messages: [] });
  vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({ answer: "Trả lời từ M-Your", thread_id: "CIF_0001" });
  vi.spyOn(agentApi, "deleteChatHistory").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("MYourWidget", () => {
  it("hides the chat overlay until the floating button is tapped", async () => {
    renderWidget();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    open();

    expect(screen.getByRole("dialog", { name: "M-Your" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("shows a short intro line above the M-Your title", async () => {
    renderWidget();
    open();

    expect(screen.getByText("Trợ lý Tài chính của bạn")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("loads real history for the active persona's CIF on open and gates the composer until it's ready", async () => {
    renderWidget();
    open();

    expect(agentApi.getChatHistory).toHaveBeenCalledWith("CIF_0001");
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeDisabled();

    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("renders prior messages loaded from history", async () => {
    vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({
      thread_id: "CIF_0001",
      messages: [
        { role: "user", content: "Tháng này tôi chi bao nhiêu?", ui: null },
        { role: "assistant", content: "Bạn đã chi 4.000.000đ.", ui: null },
      ],
    });
    renderWidget();
    open();

    expect(await screen.findByText("Tháng này tôi chi bao nhiêu?")).toBeInTheDocument();
    expect(screen.getByText("Bạn đã chi 4.000.000đ.")).toBeInTheDocument();
  });

  it("shows an error state with retry when history fails to load", async () => {
    vi.spyOn(agentApi, "getChatHistory").mockRejectedValueOnce(new Error("boom"));
    renderWidget();
    open();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeDisabled();

    vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({ thread_id: "CIF_0001", messages: [] });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("sends a message via the real agent and shows the real reply", async () => {
    renderWidget();
    open();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Xin chào" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(agentApi.sendChatMessage).toHaveBeenCalledWith("Xin chào", "CIF_0001");
    expect(screen.getByText("Xin chào")).toBeInTheDocument();
    expect(await screen.findByText("Trả lời từ M-Your")).toBeInTheDocument();
  });

  it("shows an inline error on the reply bubble when sending fails", async () => {
    vi.spyOn(agentApi, "sendChatMessage").mockRejectedValueOnce(new Error("network down"));
    renderWidget();
    open();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Xin chào" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(await screen.findByText(/Không gửi được tin nhắn/)).toBeInTheDocument();
  });

  it("deletes history via the real agent, clears the transcript, and locks the composer for 30s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWidget();
    open();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Nhắn tin cho M-Your…"), { target: { value: "Xin chào" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(screen.getByText("Xin chào")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Xóa hội thoại" }));
    await waitFor(() => expect(agentApi.deleteChatHistory).toHaveBeenCalledWith("CIF_0001"));

    expect(screen.queryByText("Xin chào")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1_001);
    });
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
  });

  it("closes the overlay with the close button", async () => {
    renderWidget();
    open();
    await waitFor(() => expect(screen.getByPlaceholderText("Nhắn tin cho M-Your…")).toBeEnabled());
    expect(screen.getByRole("dialog", { name: "M-Your" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
