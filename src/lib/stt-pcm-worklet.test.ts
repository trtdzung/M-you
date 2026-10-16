// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("PCM audio worklet", () => {
  it.each([16000, 44100, 48000])("resamples %i Hz to exactly 16 kHz across render blocks and flushes the tail", (sampleRate) => {
    const messages: { type: string; pcm?: ArrayBuffer }[] = [];
    let Processor: new () => { process: (input: Float32Array[][]) => boolean; port: { onmessage: (event: { data: string }) => void } };
    runInNewContext(readFileSync("public/stt-pcm-worklet.js", "utf8"), {
      sampleRate,
      AudioWorkletProcessor: class { port = { postMessage: (message: { type: string; pcm?: ArrayBuffer }) => messages.push(message) }; },
      registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
    });
    const processor = new Processor!();
    const input = new Float32Array(Math.round(sampleRate * 1.05)).fill(0.5);
    for (let start = 0; start < input.length; start += 128) processor.process([[input.slice(start, start + 128)]]);
    expect(messages.filter((m) => m.type === "audio")).toHaveLength(10);
    processor.port.onmessage({ data: "flush" });
    const audio = messages.filter((m) => m.type === "audio");
    expect(audio.reduce((sum, m) => sum + m.pcm!.byteLength, 0)).toBe(16800 * 2);
    expect(audio.at(-1)!.pcm!.byteLength).toBe(800 * 2);
    expect(new DataView(audio[0].pcm!).getInt16(0, true)).toBe(16384);
    expect(messages.at(-1)!.type).toBe("flushed");
  });
});
