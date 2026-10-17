import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamingSpeech } from "./use-streaming-speech";
import type { SpeechTranscriptCallback } from "./speech-types";
import type { SpeechState } from "./streaming-speech";

const mock = vi.hoisted(() => ({
  sessions: [] as {
    callbacks: { onState: (state: SpeechState) => void; onTranscript: SpeechTranscriptCallback; onError: (message: string) => void };
    cancel: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("./streaming-speech", () => ({
  StreamingSpeech: class {
    cancel = vi.fn();
    constructor(public callbacks: typeof mock.sessions[number]["callbacks"]) { mock.sessions.push(this); }
    start() { this.callbacks.onState("recording"); }
    stop() {}
  },
}));
beforeEach(() => { mock.sessions = []; });

describe("speech session isolation", () => {
  it("clears provisional text on final, error and cancel", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useStreamingSpeech(callback));
    act(() => result.current.start());
    const session = mock.sessions[0];
    act(() => session.callbacks.onTranscript("nháp", false));
    expect(result.current.partial).toBe("nháp");
    act(() => session.callbacks.onTranscript("cuối", true, { rawText: "raw", refinementStatus: "refined" }));
    expect(result.current.partial).toBe("");
    expect(callback).toHaveBeenLastCalledWith("cuối", true, { rawText: "raw", refinementStatus: "refined" });
    act(() => session.callbacks.onTranscript("nháp", false));
    act(() => session.callbacks.onError("Lỗi mạng"));
    expect(result.current.partial).toBe("");
    act(() => result.current.cancel());
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBe("");
  });

  it("ignores old callbacks after restart, cancel and unmount", () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useStreamingSpeech(callback));
    act(() => result.current.start());
    const old = mock.sessions[0];
    act(() => result.current.start());
    act(() => {
      old.callbacks.onTranscript("stale final", true);
      old.callbacks.onError("stale error");
      old.callbacks.onState("idle");
    });
    expect(result.current.state).toBe("recording");
    expect(result.current.error).toBe("");
    expect(callback).not.toHaveBeenCalled();
    const next = mock.sessions[1];
    act(() => result.current.cancel());
    act(() => next.callbacks.onTranscript("cancelled final", true));
    expect(callback).not.toHaveBeenCalled();
    act(() => result.current.start());
    const last = mock.sessions[2];
    unmount();
    act(() => last.callbacks.onTranscript("unmounted final", true));
    expect(callback).not.toHaveBeenCalled();
    expect(last.cancel).toHaveBeenCalled();
  });
});
