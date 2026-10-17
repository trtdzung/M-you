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
  const [partial, setPartial] = useState("");
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
    setPartial("");
  }, []);
  useEffect(() => () => {
    session.current?.cancel();
    session.current = null;
  }, []);

  function start() {
    session.current?.cancel();
    setError("");
    setPartial("");
    const next = new StreamingSpeech({
      onState: (value) => { if (session.current === next) setState(value); },
      onTranscript: (text, final, metadata) => {
        if (session.current !== next) return;
        setPartial(final ? "" : text);
        callback.current(text, final, metadata);
      },
      onError: (message) => {
        if (session.current !== next) return;
        setPartial("");
        callback.current("", true);
        setError(message);
      },
    }, optionsRef.current);
    session.current = next;
    void next.start();
  }
  return { state, error, partial, start, stop: () => session.current?.stop(), cancel };
}
