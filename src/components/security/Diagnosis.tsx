"use client";

import { useEffect, useRef, useState } from "react";
import { DIAGNOSE_PROPOSALS } from "@/lib/security/scenario-copy";
import type { Diagnosis as State } from "@/lib/security/diagnosis";
import { AiSessionNote } from "./InterventionCopy";

export type ClassifyAnswer = "Có" | "Không";
export const CLASSIFY_QUESTION = "Có ai đang gọi điện hướng dẫn anh/chị không?";
export const CLASSIFY_ANSWERS: readonly [ClassifyAnswer, ClassifyAnswer] = ["Có", "Không"];

const initial = (): State => ({ answers: [], pending: false, next_question: CLASSIFY_QUESTION, conclusion: null, proposals: [], source: "rule", trace: [] });

/** Answers survive copy enrichment; only the customer can act on a proposal. */
export function Diagnosis({ cif, id, onChoose, onProposals, onAnswer, sessionLine = true, sourceLine = true }: {
  cif: string;
  id: string;
  onChoose: (choice: string) => void;
  onProposals?: (choices: string[]) => void;
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

  useEffect(() => {
    onProposals?.(state.proposals.filter(p => p !== "none").map(p => DIAGNOSE_PROPOSALS[p as keyof typeof DIAGNOSE_PROPOSALS]));
  }, [state.proposals, onProposals]);

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
      {state.answers.map((value, index) => <p key={index} className="text-sm text-muted">{CLASSIFY_QUESTION} {value}</p>)}
      {state.next_question && <p className="rounded-[16px] bg-negative-soft p-4 text-base font-semibold leading-relaxed">{state.next_question}</p>}
      {state.next_question && state.answers.length < 1 && <div className="shield-options">
        {CLASSIFY_ANSWERS.map(value => <button key={value} type="button" disabled={sending || state.pending} className="shield-action disabled:opacity-50" onClick={() => void answer(value)}>{value}</button>)}
      </div>}
      {state.conclusion && <p className="text-sm leading-relaxed">{state.conclusion}</p>}
      {state.proposals.filter(p => p !== "none").map(p => <button key={p} type="button" className="shield-danger-secondary" onClick={() => onChoose(DIAGNOSE_PROPOSALS[p as keyof typeof DIAGNOSE_PROPOSALS])}>{DIAGNOSE_PROPOSALS[p as keyof typeof DIAGNOSE_PROPOSALS]}</button>)}
    </div>
  );
}
