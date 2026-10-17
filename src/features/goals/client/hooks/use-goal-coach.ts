"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type {
  CoachAnswer,
  CoachDraft,
  CoachQuestion,
  CoachResponse,
  CoachSlotName,
} from "../../coach/contracts";
import { coachGoal } from "../goals-api";

export const COACH_TIMEOUT_MS = 50_000;

export type CoachPhase =
  | "idle"
  | "asking"
  | "need_info"
  | "answering"
  | "draft"
  | "out_of_scope"
  | "failed";

/** One line of the visible conversation. */
export interface CoachTurn {
  role: "customer" | "coach";
  text: string;
}

interface CoachState {
  phase: CoachPhase;
  request: string;
  answers: CoachAnswer[];
  turns: CoachTurn[];
  response: CoachResponse | null;
}

const INITIAL: CoachState = { phase: "idle", request: "", answers: [], turns: [], response: null };

/**
 * Goal Coach conversation: idle -> asking -> need_info <-> answering -> draft | out_of_scope | failed.
 * The agent keeps no state, so every call re-sends the request plus all answers.
 */
export function useGoalCoach() {
  const cif = usePersonaCif();
  const [state, setState] = useState<CoachState>(INITIAL);
  const seq = useRef(0); // bumped by reset / cif change / timeout: older replies are dropped

  const call = useCallback(
    async (base: CoachState, phase: "asking" | "answering") => {
      if (!cif) return;
      const id = ++seq.current;
      setState({ ...base, phase });
      const timer = setTimeout(() => {
        if (seq.current !== id) return;
        seq.current++;
        setState((s) => ({ ...s, phase: "failed" }));
      }, COACH_TIMEOUT_MS);
      const res = await coachGoal(cif, { request: base.request, answers: base.answers });
      clearTimeout(timer);
      if (seq.current !== id) return;
      setState({
        ...base,
        phase: res.ok ? res.data.status : "failed",
        response: res.ok ? res.data : null,
      });
    },
    [cif],
  );

  const start = useCallback(
    (request: string) => {
      const text = request.trim();
      if (!text) return;
      void call({ ...INITIAL, request: text, turns: [{ role: "customer", text }] }, "asking");
    },
    [call],
  );

  const answer = useCallback(
    (slot: CoachSlotName, value: string, source: "option" | "text") => {
      const q = state.response?.question;
      if (state.phase !== "need_info" || !q) return;
      const label = source === "option" ? (q.options.find((o) => o.value === value)?.label ?? value) : value;
      void call(
        {
          ...state,
          answers: [...state.answers, { slot, value, source }],
          turns: [...state.turns, { role: "coach", text: q.text }, { role: "customer", text: label }],
        },
        "answering",
      );
    },
    [call, state],
  );

  const reset = useCallback(() => {
    seq.current++;
    setState(INITIAL);
  }, []);

  // Another persona: drop the conversation (and any reply still in flight).
  useEffect(() => {
    seq.current++;
    setState(INITIAL);
  }, [cif]);

  const question: CoachQuestion | null = state.phase === "need_info" ? (state.response?.question ?? null) : null;
  const draft: CoachDraft | null = state.phase === "draft" ? (state.response?.draft ?? null) : null;
  return {
    phase: state.phase,
    request: state.request,
    answers: state.answers,
    turns: state.turns,
    question,
    draft,
    requestId: state.response?.request_id ?? null,
    messageCode: state.response?.message_code ?? null,
    start,
    retry: () => { if (state.phase === "failed") void call(state, state.answers.length ? "answering" : "asking"); },
    answer,
    reset,
  };
}
