import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const speech = vi.hoisted(() => ({
  callback: null as null | ((text: string, final: boolean, metadata?: SpeechFinalMetadata) => void),
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  options: {} as SpeechSessionOptions,
}));
vi.mock("@/lib/use-streaming-speech", () => ({
  useStreamingSpeech: (callback: typeof speech.callback, options: SpeechSessionOptions) => {
    speech.callback = callback;
    speech.options = options;
    return {
      state: "idle",
      error: "",
      start: speech.start,
      stop: speech.stop,
      cancel: speech.cancel,
    };
  },
}));

describe("VoiceFab refined transcript hand-off", () => {
  beforeEach(() => {
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
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-Your bằng giọng nói" }));
    const input = await screen.findByPlaceholderText("Nhấn giữ biểu tượng M-Your để nói, hoặc gõ tại đây");

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

  it("asks for missing transfer details instead of auto-sending", async () => {
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-Your bằng giọng nói" }));
    await screen.findByPlaceholderText("Nhấn giữ biểu tượng M-Your để nói, hoặc gõ tại đây");
    act(() => speech.callback?.("Chuyển 500.000 VND sang hũ Ăn uống", true, {
      rawText: "Chuyển năm trăm nghìn sang hũ ăn uống",
      refinementStatus: "fallback",
      interpretation: {
        intent: "transfer_between_jars", status: "incomplete", confidence: 0.85,
        actionable: false, negated: false, slots: [], missing_slots: ["source"],
        ambiguous_slots: [], clarification: "Bạn muốn chuyển tiền từ hũ nào?",
      },
    }));
    expect(await screen.findByText("Bạn muốn chuyển tiền từ hũ nào?")).toBeInTheDocument();
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();
  });

  it("does not auto-send a complete command when it is negated", async () => {
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Giữ để hỏi M-Your bằng giọng nói" }));
    await screen.findByPlaceholderText("Nhấn giữ biểu tượng M-Your để nói, hoặc gõ tại đây");
    act(() => speech.callback?.("Đừng chuyển 500.000 VND từ hũ Ăn uống sang hũ Khác", true, {
      rawText: "Đừng chuyển năm trăm nghìn từ hũ ăn uống sang hũ khác",
      refinementStatus: "unchanged",
      interpretation: {
        intent: "transfer_between_jars", status: "complete", confidence: 1,
        actionable: false, negated: true, slots: [], missing_slots: [],
        ambiguous_slots: [], clarification: "Mình hiểu là bạn không muốn thực hiện giao dịch này, nên mình chưa gửi đi.",
      },
    }));
    expect(await screen.findByText("Mình hiểu là bạn không muốn thực hiện giao dịch này, nên mình chưa gửi đi.")).toBeInTheDocument();
    expect(agentApi.sendChatMessage).not.toHaveBeenCalled();
  });
});
