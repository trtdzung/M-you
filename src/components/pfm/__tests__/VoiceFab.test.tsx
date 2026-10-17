import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceFab } from "../VoiceFab";
import * as agentApi from "@/lib/agent-api";

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
  callback: null as null | ((text: string, final: boolean) => void),
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  keyterms: [] as string[],
}));
vi.mock("@/lib/use-streaming-speech", () => ({
  useStreamingSpeech: (callback: (text: string, final: boolean) => void, keyterms: string[]) => {
    speech.callback = callback;
    speech.keyterms = keyterms;
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
    expect(speech.keyterms).toContain("hũ Ăn uống");
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
});
