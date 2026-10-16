// AudioWorklet emits 100 ms of mono PCM16 LE at 16 kHz. Resampling carries
// fractional input samples across render quanta (including 44.1 kHz devices).
class STTPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.weight = 0;
    this.sum = 0;
    this.buffer = new ArrayBuffer(3200);
    this.view = new DataView(this.buffer);
    this.count = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data === "flush") {
        this.stopped = true;
        this.emit();
        this.port.postMessage({ type: "flushed" });
      }
    };
  }
  emit() {
    if (!this.count) return;
    const pcm = this.buffer.slice(0, this.count * 2);
    this.port.postMessage({ type: "audio", pcm }, [pcm]);
    this.count = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] / channels.length;
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, this.ratio - this.weight);
        this.sum += sample * take;
        this.weight += take;
        remaining -= take;
        if (this.weight >= this.ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.view.setInt16(this.count * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
          this.count++;
          this.sum = this.weight = 0;
          if (this.count === 1600) this.emit();
        }
      }
    }
    return true;
  }
}
registerProcessor("stt-pcm", STTPcmProcessor);
