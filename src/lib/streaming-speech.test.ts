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
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("early capture and connection races", () => {
  it("opens mic, worklet and ticket in parallel and captures before a slow ticket", async () => {
    const ticket = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(ticket.promise);
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    const starting = speech.start();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.onState).toHaveBeenLastCalledWith("recording");
    const first = new ArrayBuffer(3200);
    worklet.port.onmessage?.({ data: { type: "audio", pcm: first } });
    ticket.resolve({ ok: true, json: async () => ({ token: "ticket", websocket_url: "wss://speech.example.com/stream" }) } as Response);
    await starting;
    ready();
    expect(socket.send.mock.calls.map(([value]) => value)).toEqual([JSON.stringify({ type: "start", token: "ticket" }), first]);
    speech.cancel();
  });

  it("keeps the whole short utterance and tail when stopped before ready", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    const first = new ArrayBuffer(3200);
    const tail = new ArrayBuffer(100);
    worklet.port.onmessage?.({ data: { type: "audio", pcm: first } });
    speech.stop();
    speech.stop();
    expect(worklet.port.postMessage).toHaveBeenCalledTimes(1);
    worklet.port.onmessage?.({ data: { type: "audio", pcm: tail } });
    worklet.port.onmessage?.({ data: { type: "flushed" } });
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(socket.send).not.toHaveBeenCalled();
    ready();
    expect(socket.send.mock.calls.map(([value]) => value)).toEqual([
      JSON.stringify({ type: "start", token: "ticket" }), first, tail, JSON.stringify({ type: "stop" }),
    ]);
    expect(cb.onState).toHaveBeenLastCalledWith("finishing");
    socket.receive({ type: "final", text: "Xin chào" });
    expect(cb.onTranscript).toHaveBeenCalledTimes(1);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for tail flush if ready arrives between stop and flushed", async () => {
    const speech = new StreamingSpeech(callbacks());
    await speech.start();
    speech.stop();
    ready();
    expect(socket.send).not.toHaveBeenCalledWith(JSON.stringify({ type: "stop" }));
    worklet.port.onmessage?.({ data: { type: "audio", pcm: new ArrayBuffer(100) } });
    worklet.port.onmessage?.({ data: { type: "flushed" } });
    expect(socket.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "stop" }));
    speech.cancel();
  });

  it("bounds the prebuffer, reports failure and releases resources without sending truncated audio", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    for (let i = 0; i < 20; i++) worklet.port.onmessage?.({ data: { type: "audio", pcm: new ArrayBuffer(3200) } });
    expect(cb.onError).not.toHaveBeenCalled();
    worklet.port.onmessage?.({ data: { type: "audio", pcm: new ArrayBuffer(2) } });
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("Kết nối giọng nói quá chậm"));
    expect(stopTrack).toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not open a socket while a permission prompt is pending", async () => {
    const permission = deferred<MediaStream>();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(permission.promise);
    const makeSocket = vi.fn(function (url: string) { return new FakeSocket(url); });
    vi.stubGlobal("WebSocket", makeSocket);
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    const starting = speech.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(makeSocket).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
    permission.resolve(stream as unknown as MediaStream);
    await starting;
    expect(makeSocket).toHaveBeenCalledTimes(1);
    speech.cancel();
  });

  it("does not start recording later when released before permission arrives", async () => {
    const permission = deferred<MediaStream>();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(permission.promise);
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    const starting = speech.start();
    speech.stop();
    permission.resolve(stream as unknown as MediaStream);
    await starting;
    expect(cb.onState).not.toHaveBeenCalledWith("recording");
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("Micro chưa sẵn sàng"));
    expect(stopTrack).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes a microphone granted after the ticket request fails", async () => {
    const permission = deferred<MediaStream>();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(permission.promise);
    vi.mocked(fetch).mockRejectedValue(new Error("Ticket failed"));
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    permission.resolve(stream as unknown as MediaStream);
    await vi.advanceTimersByTimeAsync(0);
    expect(stopTrack).toHaveBeenCalled();
    expect(cb.onState).not.toHaveBeenCalledWith("recording");
    expect(cb.onError).toHaveBeenCalledTimes(1);
  });

  it("handles permission denial and leaves no timers", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const cb = callbacks();
    await new StreamingSpeech(cb).start();
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("chưa cấp quyền"));
    expect(closeContext).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let the capture deadline interrupt recognition after a late stop", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    ready();
    await vi.advanceTimersByTimeAsync(34_000);
    speech.stop();
    worklet.port.onmessage?.({ data: { type: "flushed" } });
    await vi.advanceTimersByTimeAsync(2_000);
    socket.receive({ type: "final", text: "Kết quả cuối" });
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it("cleans up on flush timeout and ignores queued audio after cancellation", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    ready();
    const queued = worklet.port.onmessage!;
    speech.stop();
    await vi.advanceTimersByTimeAsync(3_000);
    queued({ data: { type: "audio", pcm: new ArrayBuffer(3200) } });
    expect(socket.send).toHaveBeenCalledTimes(1); // only start
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("Không dừng được micro"));
    expect(stopTrack).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores late worklet callbacks after the server ends the utterance", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    ready();
    const queued = worklet.port.onmessage!;
    speech.stop();
    socket.receive({ type: "finishing", reason: "silence" });
    queued({ data: { type: "audio", pcm: new ArrayBuffer(3200) } });
    queued({ data: { type: "flushed" } });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(cb.onError).not.toHaveBeenCalled();
    speech.cancel();
  });

  it("does not duplicate startup or process a final twice", async () => {
    const cb = callbacks();
    const speech = new StreamingSpeech(cb);
    await speech.start();
    await speech.start();
    expect(fetch).toHaveBeenCalledTimes(1);
    ready();
    const queued = socket.onmessage!;
    socket.receive({ type: "final", text: "Số dư" });
    queued({ data: JSON.stringify({ type: "final", text: "Số dư" }) });
    expect(cb.onTranscript).toHaveBeenCalledTimes(1);
  });
});
