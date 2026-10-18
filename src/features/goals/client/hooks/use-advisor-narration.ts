"use client";

import { useEffect, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type { Analysis, PlanId } from "../../advisor/analysis-types";
import { fillTemplate, narrationValues } from "../../advisor/fill-template";
import { NARRATION_DEADLINE_MS, PLAN_IDS, type NarrateInput, type NarrateResult } from "../../advisor/narration-contract";
import { narrateAdvisor } from "../goals-api";

export interface AdvisorNarration {
  /** Lead-in line before the plans. */
  intro: string | null;
  verdict: string | null;
  plans: Partial<Record<PlanId, string>>;
}

const EMPTY: AdvisorNarration = { intro: null, verdict: null, plans: {} };

/** One narration request with a hard deadline; any failure resolves to "local" (keep the built-in template). */
async function narrate(cif: string, input: NarrateInput): Promise<NarrateResult> {
  const started = performance.now();
  const timeout = new Promise<NarrateResult>((r) => setTimeout(() => r({ source: "local" }), NARRATION_DEADLINE_MS));
  const call = narrateAdvisor(cif, input).then((res): NarrateResult => (res.ok ? res.data : { source: "local" }));
  const result = await Promise.race([call, timeout]);
  console.info(`[goal-advisor] narrate ${input.mode} source=${result.source} ms=${Math.round(performance.now() - started)}`);
  return result;
}

/**
 * LLM wording for the analysis card. The engine result is already on screen; this only adds sentences
 * later. The lead-in starts with the draft (in parallel with the engine), the explanation as soon as
 * the verdict exists. Anything late, missing or unsafe is simply not shown.
 */
export function useAdvisorNarration(
  draftKey: string | null,
  goalName: string | null,
  analysis: Analysis | null,
  conversationId: string | null = null,
): AdvisorNarration {
  const cif = usePersonaCif();
  const [intro, setIntro] = useState<{ key: string; text: string } | null>(null);
  const [explain, setExplain] = useState<{ analysis: Analysis; value: AdvisorNarration } | null>(null);

  useEffect(() => {
    if (!cif || !draftKey) return;
    let live = true;
    void narrate(cif, { mode: "converse", action: "present_plans", goalName, conversationId }).then((r) => {
      const text = r.source !== "local" ? r.blocks.find((b) => b.id === "say")?.text : undefined;
      if (live && text && !text.includes("{")) setIntro({ key: draftKey, text });
    });
    return () => {
      live = false;
    };
  }, [cif, draftKey, goalName, conversationId]);

  useEffect(() => {
    if (!cif || !analysis) return;
    let live = true;
    const planIds = PLAN_IDS.filter((id) => analysis.plans[id].available);
    void narrate(cif, { mode: "explain", verdict: analysis.verdict, planIds, goalName, conversationId }).then((r) => {
      if (!live || r.source === "local") return;
      const byId = new Map(r.blocks.map((b) => [b.id, b.text]));
      const fill = (id: string, plan: PlanId | null) => {
        const raw = byId.get(id);
        return raw ? fillTemplate(raw, narrationValues(analysis, plan)) : null;
      };
      const plans: Partial<Record<PlanId, string>> = {};
      for (const id of planIds) {
        const text = fill(`plan:${id}`, id);
        if (text) plans[id] = text;
      }
      setExplain({ analysis, value: { intro: null, verdict: fill("verdict", null), plans } });
    });
    return () => {
      live = false;
    };
  }, [cif, analysis, goalName, conversationId]);

  const current = explain && explain.analysis === analysis ? explain.value : EMPTY;
  return { ...current, intro: intro && intro.key === draftKey ? intro.text : null };
}
