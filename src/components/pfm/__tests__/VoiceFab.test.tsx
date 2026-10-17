import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceFab } from "../VoiceFab";
import * as agentApi from "@/lib/agent-api";
import type { SpeechFinalMetadata, SpeechSessionOptions } from "@/lib/speech-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/providers/context", () => ({
  usePersona: () => ({ persona: { cif: "CIF_0001" } }),
}));
vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config: { version: 3, jars: [{ id: "food", label: "Ăn uống", categoryIds: [] }] } }),
}));
vi.mock("@/state/categories", () => ({
  useCategories: () => ({ assignable: [{ id: "food", label: "Ăn uống" }] }),
}));

const speech = vi.hoisted(() => ({
  callback: null as null | ((text: string, final: boolean, metadata?: SpeechFinalMetadata) => void),
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  options: {} as SpeechSessionOptions,
  state: "idle",
  partial: "",
}));
vi.mock("@/lib/use-streaming-speech", () => ({
  useStreamingSpeech: (callback: typeof speech.callback, options: SpeechSessionOptions) => {
    speech.callback = callback;
    speech.options = options;
    return {
      state: speech.state,
      partial: speech.partial,
      error: "",
      start: speech.start,
      stop: speech.stop,
      cancel: speech.cancel,
    };
  },
}));

describe("VoiceFab refined transcript hand-off", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    speech.state = "idle";
    speech.partial = "";
    speech.start.mockClear();
    speech.stop.mockClear();
    speech.cancel.mockClear();
    vi.spyOn(agentApi, "sendChatMessage").mockResolvedValue({ answer: "Đã hiểu", thread_id: "CIF_0001" });
    document.body.innerHTML = '<div id="device-canvas"></div>';
  });

  it("hides partial text and sends only the refined final transcript", async () => {
    render(<VoiceFab />);
    expect(speech.options.keyterms).toContain("hũ Ăn uống");
    expect(speech.options.entities).toContainEqual(expect.objectContaining({ id: "food", label: "Ăn uống" }));
    expect(speech.options.endpointing).toBe("manual");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    const input = await screen.findByPlaceholderText("Nhấn giữ biểu tượng M-You để nói, hoặc gõ tại đây");

    act(() => speech.callback?.("chuyển năm trăm", false));
    expect(input).toHaveValue("");
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();

    act(() => speech.callback?.("Chuyển 500.000 VND cho Nguyễn Văn An", true));
    expect(input).toHaveValue("Chuyển 500.000 VND cho Nguyễn Văn An");
    await waitFor(() => expect(agentApi.sendChatMessage).toHaveBeenCalledWith(
      "Chuyển 500.000 VND cho Nguyễn Văn An",
      "CIF_0001",
    ));
  });

  // The mic only starts once a press has been HELD past the threshold ("giữ"); a
  // quick press-and-release ("bấm") just opens the section and never starts it.
  it("starts once per hold and flushes once despite duplicate browser release events", () => {
    vi.useFakeTimers();
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    expect(speech.start).not.toHaveBeenCalled(); // still inside the tap-vs-hold window
    act(() => { vi.advanceTimersByTime(300); });
    expect(speech.start).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(window);
    fireEvent.mouseUp(window);
    expect(speech.stop).toHaveBeenCalledTimes(1);
  });

  it("supports a keyboard hold even when opening the section replaces the button", () => {
    vi.useFakeTimers();
    render(<VoiceFab />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }), { key: " " });
    expect(speech.start).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(speech.start).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(window, { key: " " });
    expect(speech.stop).toHaveBeenCalledTimes(1);
  });

  it("does not restart STT while the final transcript is still being prepared", () => {
    speech.state = "finishing";
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    expect(speech.start).not.toHaveBeenCalled();
  });

  it("shows a temporary caption without populating or sending the input", async () => {
    const { rerender } = render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    speech.state = "recording";
    speech.partial = "chi tiêu tháng này";
    rerender(<VoiceFab />);
    expect(screen.getByLabelText("Nội dung nghe được tạm thời")).toHaveTextContent("chi tiêu tháng này");
    expect(screen.getByPlaceholderText("Nhấn giữ biểu tượng M-You để nói, hoặc gõ tại đây")).toHaveValue("");
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();
  });

  it("cancels when the section closes and ignores the subsequent release", () => {
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(window);
    expect(speech.stop).not.toHaveBeenCalled();
  });

  // The STT's own `transfer_between_jars` pre-check used to block the send here —
  // dropped (see VoiceFab.tsx): it false-positives on ordinary utterances that
  // merely mention a jar's name, and the real agent already handles genuine
  // ambiguity (or a negated request) correctly on its own. Every recognized
  // utterance now reaches the agent unconditionally, whatever `interpretation`
  // (if any) came back alongside it — these two tests just confirm that holds
  // even for the two `interpretation` shapes that used to gate it.
  it("still forwards to the agent even when the STT flags the utterance as incomplete", async () => {
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    await screen.findByPlaceholderText("Nhấn giữ biểu tượng M-You để nói, hoặc gõ tại đây");
    act(() => speech.callback?.("Chuyển 500.000 VND sang hũ Ăn uống", true, {
      rawText: "Chuyển năm trăm nghìn sang hũ ăn uống",
      refinementStatus: "fallback",
      interpretation: {
        intent: "transfer_between_jars", status: "incomplete", confidence: 0.85,
        actionable: false, negated: false, slots: [], missing_slots: ["source"],
        ambiguous_slots: [], clarification: "Bạn muốn chuyển tiền từ hũ nào?",
      },
    }));
    await waitFor(() => expect(agentApi.sendChatMessage).toHaveBeenCalledWith(
      "Chuyển 500.000 VND sang hũ Ăn uống",
      "CIF_0001",
    ));
  });

  it("still forwards a negated command — the real agent recognizes the negation itself", async () => {
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-You bằng giọng nói" }));
    await screen.findByPlaceholderText("Nhấn giữ biểu tượng M-You để nói, hoặc gõ tại đây");
    act(() => speech.callback?.("Đừng chuyển 500.000 VND từ hũ Ăn uống sang hũ Khác", true, {
      rawText: "Đừng chuyển năm trăm nghìn từ hũ ăn uống sang hũ khác",
      refinementStatus: "unchanged",
      interpretation: {
        intent: "transfer_between_jars", status: "complete", confidence: 1,
        actionable: false, negated: true, slots: [], missing_slots: [],
        ambiguous_slots: [], clarification: "Mình hiểu là bạn không muốn thực hiện giao dịch này, nên mình chưa gửi đi.",
      },
    }));
    await waitFor(() => expect(agentApi.sendChatMessage).toHaveBeenCalledWith(
      "Đừng chuyển 500.000 VND từ hũ Ăn uống sang hũ Khác",
      "CIF_0001",
    ));
  });
});
