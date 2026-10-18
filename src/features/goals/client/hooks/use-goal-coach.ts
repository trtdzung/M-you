"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type {
  CoachAdjustment,
  CoachAnswer,
  CoachCurrentDraft,
  CoachDraft,
  CoachQuestion,
  CoachResponse,
  CoachSlotName,
} from "../../coach/contracts";
import { adjustAck } from "../../advisor/templates";
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
  /** Links this conversation's turns in the agent's trace; new for every `start`. */
  conversationId: string;
  request: string;
  answers: CoachAnswer[];
  turns: CoachTurn[];
  response: CoachResponse | null;
  /** Edits the customer made to the draft by words, in order. */
  adjustments: CoachAdjustment[];
  adjustStatus: "idle" | "busy" | "unclear" | "failed";
}

export const ADJUST_TIMEOUT_MS = 20_000;

/** Short random id, same charset the agent accepts ([A-Za-z0-9_-]). */
function newConversationId(): string {
  const raw = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `gcv_${raw.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 64);
}

const INITIAL: CoachState = { phase: "idle", conversationId: "", request: "", answers: [], turns: [], response: null, adjustments: [], adjustStatus: "idle" };

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
      const res = await coachGoal(cif, { request: base.request, answers: base.answers, conversationId: base.conversationId });
      clearTimeout(timer);
      if (seq.current !== id) return;
      setState({
        ...base,
        // "adjust" only answers a request with `current_draft`, which this hook does not send yet (G17).
        phase: res.ok && res.data.status !== "adjust" ? res.data.status : "failed",
        response: res.ok ? res.data : null,
      });
    },
    [cif],
  );

  const start = useCallback(
    (request: string) => {
      const text = request.trim();
      if (!text) return;
      void call({ ...INITIAL, conversationId: newConversationId(), request: text, turns: [{ role: "customer", text }] }, "asking");
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

  /** Edit the current draft by words ("lùi 6 tháng"): the agent returns a normalised adjustment. */
  const adjustSeq = useRef(0);
  const adjust = useCallback(
    async (text: string, current: CoachCurrentDraft) => {
      const sentence = text.trim();
      if (!cif || !sentence || state.phase !== "draft") return;
      const id = ++adjustSeq.current;
      setState((s) => ({ ...s, adjustStatus: "busy" }));
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), ADJUST_TIMEOUT_MS));
      const res = await Promise.race([coachGoal(cif, { request: sentence, answers: [], currentDraft: current, conversationId: state.conversationId }), timeout]);
      if (adjustSeq.current !== id) return;
      if (res && res.ok && res.data.status === "adjust" && res.data.adjustment) {
        const adj = res.data.adjustment;
        setState((s) => ({
          ...s,
          adjustStatus: "idle",
          adjustments: [...s.adjustments, adj],
          turns: [...s.turns, { role: "customer", text: sentence }, { role: "coach", text: adjustAck(adj) }],
        }));
      } else if (res && res.ok && res.data.message_code === "adjust_unclear") {
        setState((s) => ({ ...s, adjustStatus: "unclear" }));
      } else {
        setState((s) => ({ ...s, adjustStatus: "failed" }));
      }
    },
    [cif, state.phase, state.conversationId],
  );

  const reset = useCallback(() => {
    adjustSeq.current++;
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
    conversationId: state.conversationId || null,
    messageCode: state.response?.message_code ?? null,
    start,
    retry: () => { if (state.phase === "failed") void call(state, state.answers.length ? "answering" : "asking"); },
    answer,
    adjust,
    adjustments: state.adjustments,
    adjustStatus: state.adjustStatus,
    reset,
  };
}
