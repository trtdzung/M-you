"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BatchSpeech, type BatchSpeechState } from "./batch-speech";

const WAVEFORM_SAMPLES = 18;

export function useBatchSpeech(onTranscript: (text: string) => void) {
  const [state, setState] = useState<BatchSpeechState>("idle");
  const [error, setError] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(WAVEFORM_SAMPLES).fill(0));
  const session = useRef<BatchSpeech | null>(null);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  const cancel = useCallback(() => {
    session.current?.cancel();
    session.current = null;
    setState("idle");
    setError("");
    setLevels(Array(WAVEFORM_SAMPLES).fill(0));
  }, []);

  const start = useCallback(() => {
    session.current?.cancel();
    setError("");
    setLevels(Array(WAVEFORM_SAMPLES).fill(0));
    session.current = new BatchSpeech({
      onState: setState,
      onLevel: (level) => setLevels((previous) => [...previous.slice(1), level]),
      onTranscript: (text) => callback.current(text),
      onError: setError,
    });
    void session.current.start();
  }, []);

  const stop = useCallback(() => session.current?.stop(), []);
  useEffect(() => () => session.current?.cancel(), []);

  return { state, error, levels, start, stop, cancel };
}
