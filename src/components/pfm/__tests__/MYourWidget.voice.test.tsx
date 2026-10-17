import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonaProvider } from "@/providers/context";
import { MYourWidget } from "../MYourWidget";
import * as agentApi from "@/lib/agent-api";

// The overlay opens only via `?assistant=1` (VoiceFab's "Chuyển qua Chat" hand-off).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("assistant=1"),
}));
vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config: { version: 3, jars: [{ id: "food", label: "Ăn uống", categoryIds: [] }] } }),
}));

const voice = vi.hoisted(() => ({
  callbacks: null as null | { onState: (state: string) => void; onTranscript: (text: string, final: boolean) => void; onError: (message: string) => void },
  cancel: vi.fn(), stop: vi.fn(), keyterms: [] as string[],
}));
vi.mock("@/lib/streaming-speech", () => ({
  StreamingSpeech: class {
    constructor(callbacks: typeof voice.callbacks, keyterms: string[]) {
      voice.callbacks = callbacks;
      voice.keyterms = keyterms;
    }
    start() { voice.callbacks!.onState("recording"); }
    stop = voice.stop;
    cancel = voice.cancel;
  },
}));
beforeEach(() => {
  voice.cancel.mockClear(); voice.stop.mockClear();
  vi.spyOn(agentApi, "getChatHistory").mockResolvedValue({ thread_id: "CIF_0001", messages: [] });
  vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({ answer: "Xin chào", thread_id: "CIF_0001" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openWidget() {
  render(<PersonaProvider><MYourWidget /></PersonaProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Nhập bằng giọng nói" })).toBeEnabled());
}
describe("M-Your voice composer", () => {
  it("keeps partial hypotheses hidden, preserves typed text and sends the refined final text", async () => {
    await openWidget();
    const input = screen.getByPlaceholderText("Nhắn tin cho M-Your…");
    fireEvent.change(input, { target: { value: "Cho tôi biết" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    expect(voice.keyterms).toContain("hũ Ăn uống");
    act(() => voice.callbacks!.onTranscript("chi tiêu", false));
    act(() => voice.callbacks!.onTranscript("chi tiêu tháng này", false));
    expect(input).toHaveValue("Cho tôi biết");
    expect(screen.getByRole("button", { name: "Gửi" })).toBeDisabled();
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();
    act(() => { voice.callbacks!.onTranscript("chi tiêu tháng này?", true); voice.callbacks!.onState("idle"); });
    expect(input).toHaveValue("Cho tôi biết chi tiêu tháng này?");
    expect(input).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(agentApi.sendChatMessage).toHaveBeenCalledWith("Cho tôi biết chi tiêu tháng này?", "CIF_0001"));
  });
  it("stops on request and cancels capture when the chat is closed", async () => {
    await openWidget();
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
    expect(voice.stop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(voice.cancel).toHaveBeenCalled();
  });
  it("restores the typed draft when streaming fails", async () => {
    await openWidget();
    const input = screen.getByPlaceholderText("Nhắn tin cho M-Your…");
    fireEvent.change(input, { target: { value: "Bản nháp" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    act(() => voice.callbacks!.onTranscript("chưa chốt", false));
    act(() => { voice.callbacks!.onError("Mất kết nối"); voice.callbacks!.onState("idle"); });
    expect(input).toHaveValue("Bản nháp");
    expect(screen.getByRole("alert")).toHaveTextContent("Mất kết nối");
  });
});
