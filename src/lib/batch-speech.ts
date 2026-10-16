export type BatchSpeechState = "idle" | "connecting" | "recording" | "processing";

interface Callbacks {
  onState: (state: BatchSpeechState) => void;
  onLevel: (level: number) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}

const SAMPLE_RATE = 16_000;
// Vbee sync accepts recordings shorter than 10 seconds. Keep a safety margin
// so browser scheduling and the WAV duration never cross that boundary.
const MAX_RECORDING_MS = 9_000;
const MAX_PCM_BYTES = SAMPLE_RATE * 2 * 35;
const MIN_PCM_BYTES = SAMPLE_RATE * 2 * 0.2;

/**
 * Captures one complete utterance locally. Audio is uploaded only after stop,
 * so the STT provider always receives the full context before returning text.
 */
export class BatchSpeech {
  private cancelled = false;
  private stopping = false;
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private chunks: Uint8Array[] = [];
  private totalBytes = 0;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private callbacks: Callbacks) {}

  async start() {
    this.callbacks.onState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) {
        throw new Error("Trình duyệt chưa hỗ trợ ghi âm. Hãy mở bằng HTTPS hoặc localhost trên Chrome/Edge.");
      }

      this.context = new AudioContext();
      const resumed = this.context.resume();
      this.deadline(30_000, () => this.fail("Chưa mở được micro. Vui lòng cấp quyền rồi thử lại."));
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (this.cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      await resumed;
      await this.context.audioWorklet.addModule("/stt-pcm-worklet.js");
      if (this.cancelled) return;

      this.worklet = new AudioWorkletNode(this.context, "stt-pcm");
      this.source = this.context.createMediaStreamSource(stream);
      this.worklet.port.onmessage = ({ data }) => this.onWorkletMessage(data);
      this.worklet.onprocessorerror = () => this.fail("Không xử lý được âm thanh từ micro.");
      this.source.connect(this.worklet);
      this.worklet.connect(this.context.destination); // The worklet outputs silence.
      stream.getTracks().forEach((track) => {
        track.onended = () => this.fail("Micro đã bị ngắt kết nối.");
      });

      clearTimeout(this.timer);
      this.callbacks.onState("recording");
      this.timer = setTimeout(() => this.stop(), MAX_RECORDING_MS);
    } catch (error) {
      if (!this.cancelled) {
        this.fail(error instanceof DOMException && error.name === "NotAllowedError"
          ? "Bạn chưa cấp quyền sử dụng micro. Hãy cho phép micro rồi thử lại."
          : error instanceof Error ? error.message : "Không mở được micro.");
      }
    }
  }

  stop() {
    if (this.cancelled || this.stopping) return;
    if (!this.worklet) {
      this.cancel();
      this.callbacks.onState("idle");
      return;
    }
    this.stopping = true;
    clearTimeout(this.timer);
    this.callbacks.onState("processing");
    this.worklet.port.postMessage("flush");
    this.deadline(3_000, () => this.fail("Không dừng được micro. Vui lòng thử lại."));
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    clearTimeout(this.timer);
    this.abort.abort();
    this.releaseMic();
    this.callbacks.onLevel(0);
  }

  private onWorkletMessage(data: { type?: string; pcm?: ArrayBuffer }) {
    if (this.cancelled) return;
    if (data.type === "audio" && data.pcm instanceof ArrayBuffer) {
      const chunk = new Uint8Array(data.pcm);
      this.totalBytes += chunk.byteLength;
      if (this.totalBytes > MAX_PCM_BYTES) {
        this.fail("Bản ghi âm quá dài. Hãy thử lại với câu ngắn hơn.");
        return;
      }
      this.chunks.push(chunk);
      this.callbacks.onLevel(pcmLevel(chunk));
    } else if (data.type === "flushed" && this.stopping) {
      clearTimeout(this.timer);
      this.releaseMic();
      void this.submit();
    }
  }

  private async submit() {
    if (this.totalBytes < MIN_PCM_BYTES) {
      this.fail("Bản ghi âm quá ngắn. Hãy nói rõ hơn rồi thử lại.");
      return;
    }
    try {
      const form = new FormData();
      form.append("audio", pcmToWav(this.chunks, this.totalBytes), "recording.wav");
      this.deadline(130_000, () => this.fail("Dịch vụ nhận dạng phản hồi quá chậm. Vui lòng thử lại."));
      const response = await fetch("/api/stt/transcribe", {
        method: "POST",
        body: form,
        signal: this.abort.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Không nhận dạng được giọng nói.");
      }
      if (typeof payload.text !== "string" || !payload.text.trim()) {
        throw new Error("Chưa nghe rõ giọng nói. Vui lòng thử lại.");
      }
      this.callbacks.onTranscript(payload.text.trim());
      this.cancel();
      this.callbacks.onState("idle");
    } catch (error) {
      if (!this.cancelled) {
        this.fail(error instanceof Error ? error.message : "Không nhận dạng được giọng nói.");
      }
    }
  }

  private releaseMic() {
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.source?.disconnect();
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
    }
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
  }

  private deadline(ms: number, action: () => void) {
    clearTimeout(this.timer);
    this.timer = setTimeout(action, ms);
  }

  private fail(message: string) {
    if (this.cancelled) return;
    this.cancel();
    this.callbacks.onError(message);
    this.callbacks.onState("idle");
  }
}

function pcmLevel(chunk: Uint8Array) {
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  let sum = 0;
  const samples = Math.floor(chunk.byteLength / 2);
  for (let offset = 0; offset + 1 < chunk.byteLength; offset += 2) {
    const sample = view.getInt16(offset, true) / 32768;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / Math.max(samples, 1)) * 5);
}

function pcmToWav(chunks: Uint8Array[], totalBytes: number) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + totalBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, totalBytes, true);
  const pcm = new Uint8Array(new ArrayBuffer(totalBytes));
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([header, pcm.buffer], { type: "audio/wav" });
}
