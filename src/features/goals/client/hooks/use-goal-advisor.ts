"use client";

import { useEffect, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type { Analysis, AnalyzeDraft } from "../../advisor/analysis-types";
import { analyzeGoal } from "../goals-api";

export type AdvisorPhase = "idle" | "loading" | "ready" | "failed";

/** Runs the engine analysis for a draft; re-runs when `key` (e.g. the coach request id) or the persona changes. */
export function useGoalAdvisor(draft: AnalyzeDraft | null, key: string | null) {
  const cif = usePersonaCif();
  const [state, setState] = useState<{ phase: AdvisorPhase; analysis: Analysis | null }>({ phase: "idle", analysis: null });
  const draftJson = draft ? JSON.stringify(draft) : null;

  useEffect(() => {
    if (!cif || !draftJson) {
      setState({ phase: "idle", analysis: null });
      return;
    }
    let live = true;
    setState({ phase: "loading", analysis: null });
    void analyzeGoal(cif, { draft: JSON.parse(draftJson) as AnalyzeDraft }).then((res) => {
      if (!live) return;
      setState(res.ok ? { phase: "ready", analysis: res.data } : { phase: "failed", analysis: null });
    });
    return () => {
      live = false;
    };
  }, [cif, draftJson, key]);

  return state;
}
