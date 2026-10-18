"use client";

import { useEffect, useState } from "react";
import { CLASSIFY_QUESTIONS, DIAGNOSE_ANSWERS, DIAGNOSE_PROPOSALS } from "@/lib/security/scenario-copy";
import type { Diagnosis as State } from "@/lib/security/diagnosis";
import { AiSessionNote } from "./InterventionCopy";

const initial = (): State => ({ answers: [], pending: false, next_question: CLASSIFY_QUESTIONS[0], conclusion: null, proposals: [], source: "rule", trace: [] });

/** Answers survive copy enrichment; only the customer can act on a proposal. */
export function Diagnosis({ cif, id, onChoose, onProposals, sessionLine = true }: { cif: string; id: string; onChoose: (choice: string) => void; onProposals?: (choices: string[]) => void; sessionLine?: boolean }) {
  const [state, setState] = useState<State>(initial);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setState(initial());
    setSending(false);
    void fetch(`/api/security/interventions/${encodeURIComponent(id)}/diagnose?cif=${encodeURIComponent(cif)}`, { signal: controller.signal })
      .then(async response => { if (response.ok) { const value = await response.json(); if (!controller.signal.aborted) setState(value); } })
      .catch(() => {});
    return () => controller.abort();
  }, [cif, id]);

  useEffect(() => {
    onProposals?.(state.proposals.filter(p => p !== "none").map(p => DIAGNOSE_PROPOSALS[p as keyof typeof DIAGNOSE_PROPOSALS]));
  }, [state.proposals, onProposals]);

  const answer = async (value: string) => {
    if (sending || state.pending || state.answers.length >= 2) return;
    setSending(true);
    const answers = [...state.answers, value];
    setState(current => ({ ...current, answers }));
    try {
      const response = await fetch(`/api/security/interventions/${encodeURIComponent(id)}/diagnose`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, answer: value }),
      });
      if (!response.ok) throw new Error("unavailable");
      setState(await response.json());
    } catch {
      setState({ ...initial(), answers, next_question: answers.length < 2 ? CLASSIFY_QUESTIONS[1] : null });
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="shield-diagnosis">
      {sessionLine && state.source === "agent" && <AiSessionNote />}
      <p className="text-xs font-semibold text-muted">{state.source === "agent" ? "M-You, trợ lý AI của MSB" : "Cảnh báo tự động"}</p>
      {state.answers.map((value, index) => <p key={index} className="text-sm text-muted">{CLASSIFY_QUESTIONS[index]} {value}</p>)}
      {state.next_question && <p className="rounded-[16px] bg-negative-soft p-4 text-base font-semibold leading-relaxed">{state.next_question}</p>}
      {state.next_question && state.answers.length < 2 && <div className="flex flex-wrap gap-2">
        {DIAGNOSE_ANSWERS.map(value => <button key={value} type="button" disabled={sending || state.pending} className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50" onClick={() => void answer(value)}>{value}</button>)}
      </div>}
      {state.conclusion && <p className="text-sm leading-relaxed">{state.conclusion}</p>}
      {state.proposals.filter(p => p !== "none").map(p => <button key={p} type="button" className="rounded-full border border-negative px-4 py-3 text-sm font-semibold text-negative" onClick={() => onChoose(DIAGNOSE_PROPOSALS[p as keyof typeof DIAGNOSE_PROPOSALS])}>{DIAGNOSE_PROPOSALS[p as keyof typeof DIAGNOSE_PROPOSALS]}</button>)}
    </div>
  );
}
