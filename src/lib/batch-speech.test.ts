import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchSpeech } from "./batch-speech";

const stopTrack = vi.fn();
const track = { stop: stopTrack, onended: null };
const stream = { getTracks: () => [track] };
const closeContext = vi.fn().mockResolvedValue(undefined);
let worklet: { port: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: ReturnType<typeof vi.fn> } };
const callbacks = () => ({ onState: vi.fn(), onLevel: vi.fn(), onTranscript: vi.fn(), onError: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers();
  stopTrack.mockClear();
  closeContext.mockClear();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal("AudioContext", class {
    state = "running";
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    close = closeContext;
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  });
  vi.stubGlobal("AudioWorkletNode", class {
    port = { onmessage: null, postMessage: vi.fn() };
    constructor() { worklet = this; }
    connect() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "Số dư của tôi" }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("batch microphone lifecycle", () => {
  it("keeps audio local until stop and uploads a valid complete WAV", async () => {
    const cb = callbacks();
    const speech = new BatchSpeech(cb);
    await speech.start();
    const pcm = new ArrayBuffer(16000);
    new DataView(pcm).setInt16(0, 20000, true);
    worklet.port.onmessage?.({ data: { type: "audio", pcm } });
    expect(cb.onLevel).toHaveBeenCalledWith(expect.any(Number));
    expect(fetch).not.toHaveBeenCalled();
    speech.stop();
    expect(worklet.port.postMessage).toHaveBeenCalledWith("flush");
    expect(fetch).not.toHaveBeenCalled();
    worklet.port.onmessage?.({ data: { type: "flushed" } });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/stt/transcribe");
    const audio = (options!.body as FormData).get("audio") as File;
    expect(audio.type).toBe("audio/wav");
    expect(audio.size).toBe(16044);
    vi.useRealTimers();
    const headerBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(audio.slice(0, 44));
    });
    const header = new DataView(headerBytes);
    expect(header.getUint32(24, true)).toBe(16000);
    expect(header.getUint32(40, true)).toBe(16000);
    await vi.waitFor(() => expect(cb.onTranscript).toHaveBeenCalledWith("Số dư của tôi"));
    expect(cb.onState).toHaveBeenLastCalledWith("idle");
    expect(stopTrack).toHaveBeenCalled();
  });

  it("cancels without uploading and releases a late microphone grant", async () => {
    let grant!: (value: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise<MediaStream>((resolve) => { grant = resolve; }));
    const speech = new BatchSpeech(callbacks());
    const pending = speech.start();
    speech.cancel();
    grant(stream as unknown as MediaStream);
    await pending;
    expect(stopTrack).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
