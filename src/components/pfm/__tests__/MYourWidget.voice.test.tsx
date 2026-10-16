import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonaProvider } from "@/providers/context";
import { MYourWidget } from "../MYourWidget";
import * as agentApi from "@/lib/agent-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const voice = vi.hoisted(() => ({
  callbacks: null as null | { onState: (state: string) => void; onLevel: (level: number) => void; onTranscript: (text: string) => void; onError: (message: string) => void },
  cancel: vi.fn(), stop: vi.fn(),
}));
vi.mock("@/lib/batch-speech", () => ({
  BatchSpeech: class {
    constructor(callbacks: typeof voice.callbacks) { voice.callbacks = callbacks; }
    start() { voice.callbacks!.onState("recording"); }
    stop = voice.stop;
    cancel = voice.cancel;
  },
}));

beforeEach(() => {
  voice.cancel.mockClear();
  voice.stop.mockClear();
  vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({ thread_id: "CIF_0001", messages: [] });
  vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({ answer: "Xin chào", thread_id: "CIF_0001" });
});
afterEach(() => { vi.restoreAllMocks(); });

async function openWidget() {
  render(<PersonaProvider><MYourWidget /></PersonaProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý M-Your" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Nhập bằng giọng nói" })).toBeEnabled());
}

describe("M-Your batch voice composer", () => {
  it("shows waveform while recording, then inserts only final text for review before Send", async () => {
    await openWidget();
    const input = screen.getByPlaceholderText("Nhắn tin cho M-Your…");
    fireEvent.change(input, { target: { value: "Cho tôi biết" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    act(() => voice.callbacks!.onLevel(0.8));
    expect(screen.getByRole("img", { name: "Dạng sóng âm thanh đang thu" })).toBeInTheDocument();
    expect(input).toHaveValue("Cho tôi biết");
    expect(screen.getByRole("button", { name: "Gửi" })).toBeDisabled();
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
    expect(voice.stop).toHaveBeenCalled();
    act(() => voice.callbacks!.onState("processing"));
    expect(screen.getByText("Đang nhận dạng toàn bộ bản ghi âm…")).toBeInTheDocument();
    expect(input).toHaveValue("Cho tôi biết");
    act(() => { voice.callbacks!.onTranscript("chi tiêu tháng này?"); voice.callbacks!.onState("idle"); });
    expect(input).toHaveValue("Cho tôi biết chi tiêu tháng này?");
    expect(input).toBeEnabled();
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(agentApi.sendChatMessage).toHaveBeenCalledWith("Cho tôi biết chi tiêu tháng này?", "CIF_0001"));
  });

  it("cancels capture on close and preserves typed text on STT failure", async () => {
    await openWidget();
    const input = screen.getByPlaceholderText("Nhắn tin cho M-Your…");
    fireEvent.change(input, { target: { value: "Bản nháp" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    act(() => { voice.callbacks!.onError("Mất kết nối"); voice.callbacks!.onState("idle"); });
    expect(input).toHaveValue("Bản nháp");
    expect(screen.getByRole("alert")).toHaveTextContent("Mất kết nối");
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(voice.cancel).toHaveBeenCalled();
  });
});
