import type {
  SpeechFinalMetadata,
  SpeechIntentInterpretation,
  SpeechSessionOptions,
  SpeechTranscriptCallback,
} from "./speech-types";

export type SpeechState = "idle" | "connecting" | "recording" | "finishing";
interface Callbacks {
  onState: (state: SpeechState) => void;
  onTranscript: SpeechTranscriptCallback;
  onError: (message: string) => void;
}

const REFINEMENT_STATUSES = new Set(["disabled", "refined", "unchanged", "fallback", "skipped"]);
const INTERPRETATION_STATUSES = new Set(["complete", "incomplete", "ambiguous"]);

function readInterpretation(value: unknown): SpeechIntentInterpretation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<SpeechIntentInterpretation>;
  if (
    typeof item.intent !== "string" ||
    !INTERPRETATION_STATUSES.has(String(item.status)) ||
    typeof item.confidence !== "number" ||
    typeof item.actionable !== "boolean" ||
    typeof item.negated !== "boolean" ||
    !Array.isArray(item.slots) ||
    !Array.isArray(item.missing_slots) ||
    !Array.isArray(item.ambiguous_slots) ||
    (item.clarification !== null && typeof item.clarification !== "string")
  ) return undefined;
  return item as SpeechIntentInterpretation;
}

/** One mic activation = one bounded utterance. No audio or tokens are saved. */
export class StreamingSpeech {
  private cancelled = false;
  private stopping = false;
  private finalReceived = false;
  private started = false;
  private ready = false;
  private flushed = false;
  private stopSent = false;
  // Two seconds of PCM16 mono at 16 kHz: within the server's prebuffer budget.
  private pending: ArrayBuffer[] = [];
  private pendingBytes = 0;
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private socket?: WebSocket;
  private abort = new AbortController();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private callbacks: Callbacks,
    private options: SpeechSessionOptions = {},
  ) {}

  private clearDeadline(stage: string) {
    clearTimeout(this.timers.get(stage));
    this.timers.delete(stage);
  }

  private deadline(stage: string, ms: number, message: string) {
    this.clearDeadline(stage);
    this.timers.set(stage, setTimeout(() => this.fail(message), ms));
  }

  async start() {
    if (this.started || this.cancelled) return;
    this.started = true;
    this.callbacks.onState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) {
        throw new Error("Trình duyệt chưa hỗ trợ ghi âm. Hãy mở bằng HTTPS hoặc localhost trên Chrome/Edge.");
      }
      // Start/resume AudioContext inside the user gesture (mobile browsers).
      this.context = new AudioContext();
      this.deadline("microphone", 30_000, "Chưa mở được micro. Vui lòng cấp quyền rồi thử lại.");
      const capture = this.prepareCapture(this.context);
      await Promise.all([capture, this.connect(capture)]);
    } catch (error) {
      if (!this.cancelled) this.fail(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Bạn chưa cấp quyền sử dụng micro. Hãy cho phép micro rồi thử lại."
        : error instanceof Error ? error.message : "Không mở được micro.");
    }
  }

  private async prepareCapture(context: AudioContext) {
    await Promise.all([
      context.resume(),
      context.audioWorklet.addModule("/stt-pcm-worklet.js"),
      navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }).then((stream) => {
        // Permission may resolve after a timeout, failure or deliberate cancel.
        if (this.cancelled) stream.getTracks().forEach((track) => track.stop());
        else this.stream = stream;
      }),
    ]);
    if (this.cancelled) return;
    this.clearDeadline("microphone");
    this.worklet = new AudioWorkletNode(context, "stt-pcm");
    this.source = context.createMediaStreamSource(this.stream!);
    this.worklet.port.onmessage = ({ data }) => {
      if (this.cancelled || this.flushed) return;
      try {
        if (data.type === "audio") {
          if (this.ready) this.sendAudio(data.pcm);
          else {
            if (this.pendingBytes + data.pcm.byteLength > 64_000) {
              this.fail("Kết nối giọng nói quá chậm. Vui lòng thử ghi âm lại.");
              return;
            }
            this.pending.push(data.pcm);
            this.pendingBytes += data.pcm.byteLength;
          }
        } else if (data.type === "flushed") {
          this.flushed = true;
          this.clearDeadline("flush");
          this.releaseMic();
          this.sendStop();
        }
      } catch {
        this.fail("Mất kết nối dịch vụ giọng nói. Vui lòng thử lại.");
      }
    };
    this.worklet.onprocessorerror = () => this.fail("Không xử lý được âm thanh từ micro.");
    this.source.connect(this.worklet);
    this.worklet.connect(context.destination); // worklet produces silence
    this.stream!.getTracks().forEach((track) => { track.onended = () => this.fail("Micro đã bị ngắt kết nối."); });
    this.callbacks.onState("recording");
    this.deadline("capture", 35_000, "Phiên ghi âm đã hết thời gian. Hãy thử lại với câu ngắn hơn.");
  }

  private async connect(capture: Promise<void>) {
    // Fetch in parallel. Open WS only once capture exists so permission dialogs
    // cannot consume the server's idle timeout or occupy a live session slot.
    this.deadline("ticket", 10_000, "Không tạo được phiên giọng nói. Vui lòng thử lại.");
    const response = await fetch("/api/stt/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyterms: this.options.keyterms ?? [],
        endpointing: this.options.endpointing ?? "silence",
        entities: this.options.entities ?? [],
        intents: this.options.intents ?? [],
      }),
      signal: this.abort.signal,
    });
    const session = await response.json();
    this.clearDeadline("ticket");
    if (!response.ok) throw new Error(session.error || "Không tạo được phiên ghi âm.");
    await capture;
    if (this.cancelled) return;
    this.socket = new WebSocket(session.websocket_url);
    this.deadline("connection", 10_000, "Không mở được kết nối giọng nói. Vui lòng thử lại.");
    this.socket.onopen = () => {
      if (this.cancelled) return;
      try { this.socket?.send(JSON.stringify({ type: "start", token: session.token })); }
      catch { this.fail("Mất kết nối dịch vụ giọng nói. Vui lòng thử lại."); }
    };
    this.socket.onmessage = (event) => this.onMessage(event);
    this.socket.onerror = () => this.fail("Mất kết nối dịch vụ giọng nói. Vui lòng thử lại.");
    this.socket.onclose = () => {
      if (!this.cancelled && !this.finalReceived) this.fail("Kết nối ghi âm đã đóng trước khi có kết quả.");
    };
  }

  private sendAudio(pcm: ArrayBuffer) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("Socket closed");
    if (this.socket.bufferedAmount + pcm.byteLength > 64_000) {
      this.fail("Mạng đang chậm. Hãy thử ghi âm lại.");
      return;
    }
    this.socket.send(pcm);
  }

  private sendStop() {
    if (this.cancelled || !this.ready || !this.flushed || this.stopSent) return;
    this.stopSent = true;
    this.socket!.send(JSON.stringify({ type: "stop" }));
    this.deadline("result", 125_000, "Dịch vụ nhận dạng phản hồi quá chậm. Vui lòng thử lại.");
  }

  private onMessage(event: MessageEvent) {
    if (this.cancelled) return;
    try {
      const message = JSON.parse(event.data);
      if (message.type === "ready") {
        if (message.sample_rate !== 16000 || message.format !== "pcm_s16le" || message.channels !== 1 || this.ready) throw new Error("Invalid ready");
        this.ready = true;
        this.clearDeadline("connection");
        for (const pcm of this.pending) {
          this.sendAudio(pcm);
          if (this.cancelled) return;
        }
        this.pending = [];
        this.pendingBytes = 0;
        this.sendStop();
      } else if (message.type === "partial" || message.type === "final") {
        if (typeof message.text !== "string") throw new Error("Invalid transcript");
        if (message.type === "partial") {
          this.callbacks.onTranscript(message.text, false);
        } else {
          const refinementStatus = REFINEMENT_STATUSES.has(message.refinement_status)
            ? message.refinement_status as SpeechFinalMetadata["refinementStatus"]
            : "disabled";
          const metadata: SpeechFinalMetadata = {
            rawText: typeof message.raw_text === "string" ? message.raw_text : message.text,
            refinementStatus,
          };
          const interpretation = readInterpretation(message.interpretation);
          if (interpretation) metadata.interpretation = interpretation;
          this.callbacks.onTranscript(message.text, true, metadata);
        }
        if (message.type === "final") {
          this.finalReceived = true;
          this.cancel();
          this.callbacks.onState("idle");
          if (!message.text.trim()) this.callbacks.onError("Chưa nghe rõ giọng nói. Vui lòng thử lại.");
        }
      } else if (message.type === "finishing") {
        this.stopping = true;
        this.flushed = true;
        this.clearDeadline("capture");
        this.clearDeadline("flush");
        this.releaseMic();
        this.callbacks.onState("finishing");
        this.deadline("result", 125_000, "Dịch vụ nhận dạng phản hồi quá chậm. Vui lòng thử lại.");
      } else if (message.type === "error") {
        this.fail(typeof message.message === "string" ? message.message : "Không nhận dạng được giọng nói.");
      } else throw new Error("Unknown message");
    } catch {
      this.fail("Dịch vụ giọng nói trả về dữ liệu không hợp lệ.");
    }
  }

  stop() {
    if (this.cancelled || this.stopping) return;
    if (!this.worklet) {
      // Never open a microphone later after the user has already released.
      this.fail("Micro chưa sẵn sàng. Hãy cấp quyền micro rồi nhấn giữ để nói lại.");
      return;
    }
    this.stopping = true;
    this.clearDeadline("capture");
    this.callbacks.onState("finishing");
    this.deadline("flush", 3_000, "Không dừng được micro. Vui lòng thử lại.");
    // Keep the tail and queued audio even if the connection is not ready yet.
    this.worklet.port.postMessage("flush");
  }

  private releaseMic() {
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stream = undefined;
    this.source?.disconnect();
    this.source = undefined;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.onprocessorerror = null;
      this.worklet.disconnect();
    }
    this.worklet = undefined;
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = undefined;
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.abort.abort();
    this.pending = [];
    this.pendingBytes = 0;
    this.releaseMic();
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
      this.socket.close();
    }
  }

  private fail(message: string) {
    if (this.cancelled) return;
    this.cancel();
    this.callbacks.onError(message);
    this.callbacks.onState("idle");
  }
}
