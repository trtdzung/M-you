import { type RenderOptions, act, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonaProvider } from "@/providers/context";
import { MYourWidget } from "../MYourWidget";
import * as agentApi from "@/lib/agent-api";
import type { SpeechFinalMetadata, SpeechSessionOptions } from "@/lib/speech-types";


/**
 * Every render goes through `StubCategoryTaxonomy`: the components below read
 * the persona's taxonomy via `useCategories()` but own none of it, so they get
 * an already-loaded preset taxonomy instead of the real fetching provider (the
 * provider itself is covered by its own tests).
 */
const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

// The overlay opens only via `?assistant=1` (VoiceFab's "Chuyển qua Chat" hand-off).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("assistant=1"),
}));
vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config: { version: 3, jars: [{ id: "food", label: "Ăn uống", categoryIds: [] }] } }),
}));

const voice = vi.hoisted(() => ({
  callbacks: null as null | { onState: (state: string) => void; onTranscript: (text: string, final: boolean, metadata?: SpeechFinalMetadata) => void; onError: (message: string) => void },
  cancel: vi.fn(), stop: vi.fn(), keyterms: [] as string[],
  options: {} as SpeechSessionOptions,
}));
vi.mock("@/lib/streaming-speech", () => ({
  StreamingSpeech: class {
    constructor(callbacks: typeof voice.callbacks, options: SpeechSessionOptions) {
      voice.callbacks = callbacks;
      voice.keyterms = options.keyterms ?? [];
      voice.options = options;
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
describe("M-You voice composer", () => {
  it("shows partial captions separately, preserves typed text and sends the refined final text", async () => {
    await openWidget();
    const input = screen.getByPlaceholderText("Nhắn tin cho M-You…");
    fireEvent.change(input, { target: { value: "Cho tôi biết" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    expect(voice.keyterms).toContain("hũ Ăn uống");
    expect(voice.options.endpointing).toBe("silence");
    act(() => voice.callbacks!.onTranscript("chi tiêu", false));
    act(() => voice.callbacks!.onTranscript("chi tiêu tháng này", false));
    expect(input).toHaveValue("Cho tôi biết");
    expect(screen.getByLabelText("Nội dung nghe được tạm thời")).toHaveTextContent("chi tiêu tháng này");
    expect(screen.getByRole("button", { name: "Gửi" })).toBeDisabled();
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();
    act(() => { voice.callbacks!.onTranscript("chi tiêu tháng này?", true); voice.callbacks!.onState("idle"); });
    expect(input).toHaveValue("Cho tôi biết chi tiêu tháng này?");
    expect(screen.queryByLabelText("Nội dung nghe được tạm thời")).not.toBeInTheDocument();
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
    const input = screen.getByPlaceholderText("Nhắn tin cho M-You…");
    fireEvent.change(input, { target: { value: "Bản nháp" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    act(() => voice.callbacks!.onTranscript("chưa chốt", false));
    act(() => { voice.callbacks!.onError("Mất kết nối"); voice.callbacks!.onState("idle"); });
    expect(input).toHaveValue("Bản nháp");
    expect(screen.getByRole("alert")).toHaveTextContent("Mất kết nối");
    expect(screen.queryByLabelText("Nội dung nghe được tạm thời")).not.toBeInTheDocument();
  });
  // This screen never auto-sends on voice (the customer always presses Gửi
  // themselves), so the STT's own `interpretation` has nothing to gate here — it
  // used to still surface a local "cần thêm..." hint, dropped because that signal
  // false-positives on ordinary utterances (see VoiceFab.tsx). The recognized
  // text just lands in the composer, editable, same as any other voice input.
  it("keeps a recognized command editable, with no local guidance from the STT's own intent hint", async () => {
    await openWidget();
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    act(() => {
      voice.callbacks!.onTranscript("Chuyển 500.000 VND sang hũ Ăn uống", true, {
        rawText: "Chuyển năm trăm nghìn sang hũ ăn uống",
        refinementStatus: "fallback",
        interpretation: {
          intent: "transfer_between_jars", status: "incomplete", confidence: 0.85,
          actionable: false, negated: false, slots: [], missing_slots: ["source"],
          ambiguous_slots: [], clarification: "Bạn muốn chuyển tiền từ hũ nào?",
        },
      });
      voice.callbacks!.onState("idle");
    });
    expect(screen.getByPlaceholderText("Nhắn tin cho M-You…")).toHaveValue("Chuyển 500.000 VND sang hũ Ăn uống");
    expect(screen.queryByText("Bạn muốn chuyển tiền từ hũ nào?")).not.toBeInTheDocument();
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();
  });
});
