export type SpeechState = "idle" | "connecting" | "recording" | "finishing";
export type SpeechEndpointing = "silence" | "manual";
interface Callbacks {
  onState: (state: SpeechState) => void;
  onTranscript: (text: string, final: boolean) => void;
  onError: (message: string) => void;
}

/** One mic activation = one bounded utterance. No audio or tokens are saved. */
export class StreamingSpeech {
  private cancelled = false;
  private stopping = false;
  private finalReceived = false;
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private socket?: WebSocket;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private callbacks: Callbacks,
    private keyterms: string[] = [],
    private endpointing: SpeechEndpointing = "silence",
  ) {}

  private deadline(ms: number, message: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(message), ms);
  }

  async start() {
    this.callbacks.onState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) {
        throw new Error("Trình duyệt chưa hỗ trợ ghi âm. Hãy mở bằng HTTPS hoặc localhost trên Chrome/Edge.");
      }
      // Start/resume AudioContext inside the user gesture (mobile browsers).
      this.context = new AudioContext();
      const resumed = this.context.resume();
      this.deadline(30_000, "Chưa mở được micro. Vui lòng cấp quyền rồi thử lại.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (this.cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      await resumed;
      if (this.cancelled) return;
      await this.context.audioWorklet.addModule("/stt-pcm-worklet.js");
      if (this.cancelled) return;
      const response = await fetch("/api/stt/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyterms: this.keyterms, endpointing: this.endpointing }),
        signal: this.abort.signal,
      });
      const session = await response.json();
      if (!response.ok) throw new Error(session.error || "Không tạo được phiên ghi âm.");
      if (this.cancelled) return;
      this.socket = new WebSocket(session.websocket_url);
      this.deadline(10_000, "Không mở được kết nối giọng nói. Vui lòng thử lại.");
      this.socket.onopen = () => this.socket?.send(JSON.stringify({ type: "start", token: session.token }));
      this.socket.onmessage = (event) => this.onMessage(event);
      this.socket.onerror = () => this.fail("Mất kết nối dịch vụ giọng nói. Vui lòng thử lại.");
      this.socket.onclose = () => {
        if (!this.cancelled && !this.finalReceived) this.fail("Kết nối ghi âm đã đóng trước khi có kết quả.");
      };
    } catch (error) {
      if (!this.cancelled) this.fail(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Bạn chưa cấp quyền sử dụng micro. Hãy cho phép micro rồi thử lại."
        : error instanceof Error ? error.message : "Không mở được micro.");
    }
  }

  private onMessage(event: MessageEvent) {
    if (this.cancelled) return;
    try {
      const message = JSON.parse(event.data);
      if (message.type === "ready") {
        if (message.sample_rate !== 16000 || message.format !== "pcm_s16le" || message.channels !== 1 || this.worklet) throw new Error("Invalid ready");
        this.worklet = new AudioWorkletNode(this.context!, "stt-pcm");
        this.source = this.context!.createMediaStreamSource(this.stream!);
        this.worklet.port.onmessage = ({ data }) => {
          if (this.cancelled || this.socket?.readyState !== WebSocket.OPEN) return;
          if (data.type === "audio") {
            if (this.socket.bufferedAmount > 64_000) {
              this.fail("Mạng đang chậm. Hãy thử ghi âm lại.");
              return;
            }
            this.socket.send(data.pcm);
          } else if (data.type === "flushed") {
            this.releaseMic();
            this.socket.send(JSON.stringify({ type: "stop" }));
            this.deadline(125_000, "Dịch vụ nhận dạng phản hồi quá chậm. Vui lòng thử lại.");
          }
        };
        this.worklet.onprocessorerror = () => this.fail("Không xử lý được âm thanh từ micro.");
        this.source.connect(this.worklet);
        this.worklet.connect(this.context!.destination); // worklet produces silence
        this.stream!.getTracks().forEach((track) => { track.onended = () => this.fail("Micro đã bị ngắt kết nối."); });
        this.callbacks.onState("recording");
        this.deadline(35_000, "Phiên ghi âm đã hết thời gian. Hãy thử lại với câu ngắn hơn.");
      } else if (message.type === "partial" || message.type === "final") {
        if (typeof message.text !== "string") throw new Error("Invalid transcript");
        this.callbacks.onTranscript(message.text, message.type === "final");
        if (message.type === "final") {
          this.finalReceived = true;
          this.cancel();
          this.callbacks.onState("idle");
          if (!message.text.trim()) this.callbacks.onError("Chưa nghe rõ giọng nói. Vui lòng thử lại.");
        }
      } else if (message.type === "finishing") {
        this.stopping = true;
        this.releaseMic();
        this.callbacks.onState("finishing");
        this.deadline(125_000, "Dịch vụ nhận dạng phản hồi quá chậm. Vui lòng thử lại.");
      } else if (message.type === "error") {
        this.fail(typeof message.message === "string" ? message.message : "Không nhận dạng được giọng nói.");
      } else throw new Error("Unknown message");
    } catch {
      this.fail("Dịch vụ giọng nói trả về dữ liệu không hợp lệ.");
    }
  }

  stop() {
    if (this.cancelled || this.stopping) return;
    if (!this.worklet) { this.cancel(); this.callbacks.onState("idle"); return; }
    this.stopping = true;
    this.callbacks.onState("finishing");
    // Flush the last <100 ms before sending stop; WebSocket preserves order.
    this.worklet.port.postMessage("flush");
    this.deadline(3_000, "Không dừng được micro. Vui lòng thử lại.");
  }

  private releaseMic() {
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.source?.disconnect();
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.disconnect(); }
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
  }

  cancel() {
    this.cancelled = true;
    clearTimeout(this.timer);
    this.abort.abort();
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
