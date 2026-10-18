"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type { Analysis, AnalyzeDraft, PlanId } from "../../advisor/analysis-types";
import { effectivePlan } from "../../advisor/recommend";
import { analyzeGoal } from "../goals-api";

export type AdvisorPhase = "idle" | "loading" | "ready" | "failed";
export interface AdvisorOverrides {
  targetDate?: string;
  targetAmount?: number;
}

const SLIDER_DEBOUNCE_MS = 400;

/** One analysis call, debounced; the result of an older input is never returned. */
function useAnalysis(cif: string | null, draftJson: string | null, overrides: AdvisorOverrides, key: string | null, delay: number) {
  const overridesJson = JSON.stringify(overrides);
  const ident = cif && draftJson ? JSON.stringify([cif, draftJson, overridesJson, key]) : null;
  const [state, setState] = useState<{ ident: string; analysis: Analysis | null } | null>(null);

  useEffect(() => {
    if (!ident || !cif || !draftJson) return;
    let live = true;
    const timer = setTimeout(() => {
      void analyzeGoal(cif, {
        draft: JSON.parse(draftJson) as AnalyzeDraft,
        overrides: JSON.parse(overridesJson) as AdvisorOverrides,
      }).then((res) => {
        if (live) setState({ ident, analysis: res.ok ? res.data : null });
      });
    }, delay);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `ident` encodes every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ident]);

  if (!ident) return { phase: "idle" as AdvisorPhase, analysis: null };
  const current = state?.ident === ident ? state : null;
  if (!current) return { phase: "loading" as AdvisorPhase, analysis: null };
  return current.analysis ? { phase: "ready" as AdvisorPhase, analysis: current.analysis } : { phase: "failed" as AdvisorPhase, analysis: null };
}

/**
 * Engine analysis of a draft plus the what-if state: slider overrides (debounced, stale results hidden)
 * and the single selected plan the whole card agrees on.
 */
export function useGoalAdvisor(draft: AnalyzeDraft | null, key: string | null) {
  const cif = usePersonaCif();
  const draftJson = draft ? JSON.stringify(draft) : null;
  const [overrides, setOverridesState] = useState<AdvisorOverrides>({});
  const [selected, setSelected] = useState<PlanId | null>(null);

  // A new draft starts from scratch.
  useEffect(() => {
    setOverridesState({});
    setSelected(null);
  }, [draftJson, key, cif]);

  const hasOverrides = overrides.targetDate !== undefined || overrides.targetAmount !== undefined;
  const base = useAnalysis(cif, draftJson, {}, key, 0);
  const adjusted = useAnalysis(hasOverrides ? cif : null, draftJson, overrides, key, SLIDER_DEBOUNCE_MS);
  const view = hasOverrides ? adjusted : base;

  const setOverrides = useCallback((next: AdvisorOverrides) => setOverridesState(next), []);
  return {
    /** Analysis of the customer's own goal (steps, verdict). */
    phase: base.phase,
    analysis: base.analysis,
    /** Analysis for the current slider position; `analysis` is null while it is recalculating. */
    view,
    overrides,
    setOverrides,
    selectedPlanId: view.analysis ? effectivePlan(view.analysis, selected) : null,
    selectPlan: setSelected,
  };
}
