import type { Analysis, AnalyzeDraft, PlanId } from "../../advisor/analysis-types";
import { recommendedPlan } from "../../advisor/recommend";
import { sliderSentence } from "../../advisor/templates";
import type { AdvisorOverrides } from "../../client/hooks/use-goal-advisor";
import type { AdvisorNarration } from "../../client/hooks/use-advisor-narration";
import { GOALS_COPY } from "../copy";
import { PlanCard } from "./PlanCard";
import { PlanSliders } from "./PlanSliders";
import { ProgressChart } from "./ProgressChart";

const ORDER: PlanId[] = ["keep_deadline", "extend_deadline", "reduce_amount"];

/** The three plans side by side, their chart and the what-if sliders. */
export function PlanCompare({
  draft,
  view,
  overrides,
  onOverrides,
  selectedPlanId,
  onSelect,
  narration,
}: {
  draft: AnalyzeDraft;
  view: { phase: "idle" | "loading" | "ready" | "failed"; analysis: Analysis | null };
  overrides: AdvisorOverrides;
  onOverrides: (next: AdvisorOverrides) => void;
  selectedPlanId: PlanId | null;
  onSelect: (id: PlanId) => void;
  narration?: AdvisorNarration;
}) {
  const c = GOALS_COPY.advisor;
  const a = view.analysis;
  // The sentences describe the customer's own goal; once a slider moves they would no longer match the numbers.
  const adjusted = overrides.targetDate !== undefined || overrides.targetAmount !== undefined;
  const targetDate = overrides.targetDate ?? draft.targetDate;
  const targetAmount = overrides.targetAmount ?? draft.targetAmount;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[15px] font-semibold text-text">{c.plans.title}</h3>
      {narration?.intro && !adjusted && <p className="text-[14px] leading-6 text-muted">{narration.intro}</p>}
      {a && selectedPlanId ? (
        <>
          <div role="radiogroup" aria-label={c.plans.title} className="flex flex-col gap-3">
            {ORDER.map((id) => (
              <PlanCard key={id} plan={a.plans[id]} selected={id === selectedPlanId} recommended={id === recommendedPlan(a)} onSelect={() => onSelect(id)} narration={adjusted ? null : narration?.plans[id]} />
            ))}
          </div>
          <ProgressChart analysis={a} selectedPlanId={selectedPlanId} />
        </>
      ) : (
        <p role="status" className="text-sm text-muted">{c.sliders.recalculating}</p>
      )}
      <PlanSliders
        draft={draft}
        overrides={overrides}
        onChange={onOverrides}
        sentence={a ? sliderSentence(a, targetDate, targetAmount) : null}
        state={view.phase === "failed" ? "failed" : a ? "ready" : "loading"}
      />
    </div>
  );
}
