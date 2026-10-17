"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StreamingSpeech, type SpeechState } from "./streaming-speech";

export function useStreamingSpeech(
  onTranscript: (text: string, final: boolean) => void,
  keyterms: string[] = [],
) {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState("");
  const session = useRef<StreamingSpeech | null>(null);
  const callback = useRef(onTranscript);
  const keytermsRef = useRef(keyterms);
  callback.current = onTranscript;
  keytermsRef.current = keyterms;

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
      onTranscript: (text, final) => callback.current(text, final),
      onError: (message) => { callback.current("", true); setError(message); },
    }, keytermsRef.current);
    void session.current.start();
  }
  return { state, error, start, stop: () => session.current?.stop(), cancel };
}
