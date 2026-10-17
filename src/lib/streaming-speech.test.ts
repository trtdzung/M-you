import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingSpeech } from "./streaming-speech";

const stopTrack = vi.fn();
const track = { stop: stopTrack, onended: null };
const stream = { getTracks: () => [track] };
const closeContext = vi.fn().mockResolvedValue(undefined);
let worklet: { port: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: ReturnType<typeof vi.fn> } };
let socket: FakeSocket;
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) { socket = this; }
  receive(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
const callbacks = () => ({ onState: vi.fn(), onTranscript: vi.fn(), onError: vi.fn() });

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
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "ticket", websocket_url: "wss://speech.example.com/stream" }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function ready() {
  socket.onopen?.();
  socket.receive({ type: "ready", sample_rate: 16000, format: "pcm_s16le", channels: 1 });
}

describe("streaming microphone lifecycle", () => {
  it("streams audio before stop, delivers revised partials and flushes the tail before stop", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb, {
      keyterms: ["hũ Ăn uống", "hũ Tiết kiệm"],
      endpointing: "manual",
      entities: [{ id: "food", type: "budget_jar", label: "Ăn uống", aliases: ["hũ Ăn uống"] }],
      intents: ["transfer_between_jars"],
    });
    await speech.start();
    expect(fetch).toHaveBeenCalledWith("/api/stt/session", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        keyterms: ["hũ Ăn uống", "hũ Tiết kiệm"],
        endpointing: "manual",
        entities: [{ id: "food", type: "budget_jar", label: "Ăn uống", aliases: ["hũ Ăn uống"] }],
        intents: ["transfer_between_jars"],
      }),
    }));
    ready();
    expect(socket.url).not.toContain("ticket");
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "start", token: "ticket" }));
    const pcm = new ArrayBuffer(3200);
    worklet.port.onmessage?.({ data: { type: "audio", pcm } });
    expect(socket.send).toHaveBeenLastCalledWith(pcm);
    socket.receive({ type: "partial", text: "chi tiêu" });
    socket.receive({ type: "partial", text: "chi tiêu tháng này" });
    expect(cb.onTranscript).toHaveBeenLastCalledWith("chi tiêu tháng này", false);
    speech.stop();
    expect(worklet.port.postMessage).toHaveBeenCalledWith("flush");
    expect(socket.send).not.toHaveBeenCalledWith(JSON.stringify({ type: "stop" }));
    const tail = new ArrayBuffer(100);
    worklet.port.onmessage?.({ data: { type: "audio", pcm: tail } });
    worklet.port.onmessage?.({ data: { type: "flushed" } });
    expect(socket.send.mock.calls.slice(-2).map(([value]) => value)).toEqual([tail, JSON.stringify({ type: "stop" })]);
    socket.receive({
      type: "final",
      text: "Chi tiêu tháng này?",
      raw_text: "chi tiêu tháng này",
      refinement_status: "refined",
      interpretation: null,
    });
    expect(cb.onTranscript).toHaveBeenLastCalledWith("Chi tiêu tháng này?", true, {
      rawText: "chi tiêu tháng này",
      refinementStatus: "refined",
    });
    expect(cb.onState).toHaveBeenLastCalledWith("idle");
    expect(stopTrack).toHaveBeenCalled();
    expect(closeContext).toHaveBeenCalled();
  });
  it("stops tracks even when permission resolves after the chat has closed", async () => {
    let grant!: (value: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise<MediaStream>((resolve) => { grant = resolve; }));
    const speech = new StreamingSpeech(callbacks());
    const pending = speech.start();
    speech.cancel();
    grant(stream as unknown as MediaStream);
    await pending;
    expect(stopTrack).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("stops capture immediately on server endpoint detection and only accepts the final text", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    ready();
    socket.receive({ type: "finishing", reason: "silence" });
    expect(stopTrack).toHaveBeenCalled();
    expect(cb.onState).toHaveBeenLastCalledWith("finishing");
    socket.receive({ type: "final", text: "Số dư của tôi" });
    expect(cb.onTranscript).toHaveBeenCalledWith("Số dư của tôi", true, {
      rawText: "Số dư của tôi",
      refinementStatus: "disabled",
    });
    expect(cb.onError).not.toHaveBeenCalled();
  });
  it("fails and releases the mic on backpressure or unexpected disconnect", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    ready();
    socket.bufferedAmount = 64001;
    worklet.port.onmessage?.({ data: { type: "audio", pcm: new ArrayBuffer(3200) } });
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("Mạng đang chậm"));
    expect(stopTrack).toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
    const next = new StreamingSpeech(cb);
    await next.start();
    ready();
    socket.onclose?.();
    expect(cb.onError).toHaveBeenLastCalledWith(expect.stringContaining("trước khi có kết quả"));
  });
});
