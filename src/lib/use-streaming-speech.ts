"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StreamingSpeech, type SpeechState } from "./streaming-speech";
import type { SpeechSessionOptions, SpeechTranscriptCallback } from "./speech-types";

export function useStreamingSpeech(
  onTranscript: SpeechTranscriptCallback,
  options: SpeechSessionOptions = {},
) {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState("");
  const session = useRef<StreamingSpeech | null>(null);
  const callback = useRef(onTranscript);
  const optionsRef = useRef(options);
  callback.current = onTranscript;
  optionsRef.current = options;

  const cancel = useCallback(() => {
    session.current?.cancel();
    session.current = null;
    setState("idle");
    setError("");
  }, []);
  useEffect(() => () => session.current?.cancel(), []);

  function start() {
    session.current?.cancel();
    setError("");
    session.current = new StreamingSpeech({
      onState: setState,
      onTranscript: (text, final, metadata) => callback.current(text, final, metadata),
      onError: (message) => { callback.current("", true); setError(message); },
    }, optionsRef.current);
    void session.current.start();
  }
  return { state, error, start, stop: () => session.current?.stop(), cancel };
}
