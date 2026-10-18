"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { GOALS_COPY } from "../copy";

export interface AnalysisStep {
  title: string;
  /** null while the engine is still working on this step. */
  text: string | null;
}

const STEP_DELAY_MS = 450;

/** Steps appear one after another; a step without text yet shows "calculating". */
export function AnalysisSteps({ steps }: { steps: AnalysisStep[] }) {
  const [shown, setShown] = useState(1);
  const ready = steps.filter((s) => s.text !== null).length;

  useEffect(() => {
    if (shown >= steps.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), STEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shown, steps.length]);

  return (
    <ol className="flex flex-col gap-3" aria-label={GOALS_COPY.advisor.stepsLabel}>
      {steps.slice(0, shown).map((step, i) => {
        const done = step.text !== null && i < ready;
        return (
          <li key={step.title} className="flex gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-positive-soft text-positive" : "bg-surface-muted text-muted"}`}
              aria-hidden="true"
            >
              {done ? <Check size={14} /> : <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-5 text-text">{step.title}</p>
              <p className="text-[14px] leading-6 text-muted">{step.text ?? GOALS_COPY.advisor.calculating}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
