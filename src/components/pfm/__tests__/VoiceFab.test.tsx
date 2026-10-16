import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceFab } from "../VoiceFab";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams("tab=overview"),
}));

const voice = vi.hoisted(() => ({
  callbacks: null as null | { onState: (state: string) => void; onLevel: (level: number) => void; onTranscript: (text: string) => void; onError: (message: string) => void },
  start: vi.fn(), cancel: vi.fn(), stop: vi.fn(),
}));
vi.mock("@/lib/batch-speech", () => ({
  BatchSpeech: class {
    constructor(callbacks: typeof voice.callbacks) { voice.callbacks = callbacks; }
    start() { voice.start(); voice.callbacks!.onState("recording"); }
    stop = voice.stop;
    cancel = voice.cancel;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  navigation.replace.mockClear();
  voice.start.mockClear();
  voice.stop.mockClear();
  voice.cancel.mockClear();
  window.sessionStorage.clear();
  const canvas = document.createElement("div");
  canvas.id = "device-canvas";
  document.body.appendChild(canvas);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.getElementById("device-canvas")?.remove();
});

describe("center voice FAB", () => {
  it("opens only the compact panel on a tap without opening M-Your or the microphone", () => {
    render(<VoiceFab />);
    const mic = screen.getByRole("button", { name: "Nhấn để mở, giữ để nói với M-Your" });
    fireEvent.pointerDown(mic, { button: 0 });
    fireEvent.pointerUp(window);

    expect(screen.getByText("Đang chờ…")).toBeInTheDocument();
    expect(voice.start).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("starts recording during the first hold and opens M-Your only after a transcript", () => {
    render(<VoiceFab />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Nhấn để mở, giữ để nói với M-Your" }), { button: 0 });
    act(() => vi.advanceTimersByTime(220));

    expect(voice.start).toHaveBeenCalledOnce();
    expect(screen.getByText("Đang nghe…")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();

    fireEvent.pointerUp(window);
    expect(voice.stop).toHaveBeenCalledOnce();
    act(() => voice.callbacks!.onTranscript("Tôi đã chi bao nhiêu tháng này?"));

    expect(window.sessionStorage.getItem("msb-pfm.voice-assistant-draft")).toBe("Tôi đã chi bao nhiêu tháng này?");
    expect(navigation.replace).toHaveBeenCalledWith("/pfm?tab=overview&assistant=1", { scroll: false });
  });
});
