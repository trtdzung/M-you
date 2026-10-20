"use client";

import { useEffect, useRef, useState } from "react";
import type { Diagnosis as State } from "@/lib/security/diagnosis";
import { AiSessionNote } from "./InterventionCopy";

type ClassifyAnswer = "Có" | "Không";
const CLASSIFY_QUESTION = "Có ai đang gọi điện hướng dẫn anh/chị không?";
const CLASSIFY_ANSWERS: readonly [ClassifyAnswer, ClassifyAnswer] = ["Có", "Không"];

const initial = (): State => ({ answers: [], pending: false, next_question: CLASSIFY_QUESTION, conclusion: null, proposals: [], source: "rule", trace: [] });

/** Answers survive copy enrichment; agent conclusions remain informational. */
export function Diagnosis({ cif, id, question = CLASSIFY_QUESTION, onAnswer, sessionLine = true, sourceLine = true }: {
  cif: string;
  id: string;
  question?: string;
  onAnswer?: (answer: "Có" | "Không") => void;
  sessionLine?: boolean;
  sourceLine?: boolean;
}) {
  const [state, setState] = useState<State>(initial);
  const [sending, setSending] = useState(false);
  const onAnswerRef = useRef(onAnswer);
  useEffect(() => {
    onAnswerRef.current = onAnswer;
  }, [onAnswer]);

  useEffect(() => {
    const controller = new AbortController();
    setState(initial());
    setSending(false);
    void fetch(`/api/security/interventions/${encodeURIComponent(id)}/diagnose?cif=${encodeURIComponent(cif)}`, { signal: controller.signal })
      .then(async response => {
        if (response.ok) {
          const value = await response.json();
          if (!controller.signal.aborted) {
            setState(value);
            const first = value.answers?.[0];
            if (first === "Có" || first === "Không") {
              onAnswerRef.current?.(first);
            }
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [cif, id]);

  const answer = async (value: ClassifyAnswer) => {
    if (sending || state.pending || state.answers.length >= 1) return;
    setSending(true);
    onAnswerRef.current?.(value);
    const answers = [...state.answers, value];
    setState(current => ({ ...current, answers, next_question: null }));
    try {
      const response = await fetch(`/api/security/interventions/${encodeURIComponent(id)}/diagnose`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, answer: value }),
      });
      if (!response.ok) throw new Error("unavailable");
      const next = await response.json();
      setState({ ...next, next_question: null });
    } catch {
      setState({ ...initial(), answers, next_question: null });
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="shield-diagnosis">
      {sessionLine && state.source === "agent" && <AiSessionNote />}
      {sourceLine && <p className="shield-source">{state.source === "agent" ? "M-You, trợ lý AI của MSB" : "Cảnh báo tự động"}</p>}
      {state.answers.map((value, index) => <p key={index} className="text-sm text-muted">{question} {value}</p>)}
      {state.next_question && <p className="shield-diagnosis-question rounded-[16px] bg-negative-soft p-4 text-base font-semibold leading-relaxed">{question}</p>}
      {state.next_question && state.answers.length < 1 && <div className="shield-options">
        {CLASSIFY_ANSWERS.map(value => <button key={value} type="button" disabled={sending || state.pending} className="shield-action disabled:opacity-50" onClick={() => void answer(value)}>{value}</button>)}
      </div>}
      {state.conclusion && <p className="text-sm leading-relaxed">{state.conclusion}</p>}
    </div>
  );
}
