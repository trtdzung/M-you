import type { Analysis, AnalyzeDraft, PlanId } from "../../advisor/analysis-types";
import { cashflowSentence, understoodSentence, verdictSentence } from "../../advisor/templates";
import type { AdvisorOverrides } from "../../client/hooks/use-goal-advisor";
import type { AdvisorNarration } from "../../client/hooks/use-advisor-narration";
import { monthsLeft } from "../../engine/months";
import { transferNow } from "@/lib/demo-clock";
import { GOALS_COPY } from "../copy";
import { primaryButton } from "../styles";
import { AnalysisSteps } from "./AnalysisSteps";
import { PlanCompare } from "./PlanCompare";
import { VerdictCard } from "./VerdictCard";

export interface GoalAdvisorCardProps {
  draft: AnalyzeDraft;
  /** Analysis of the customer's own goal. */
  analysis: Analysis | null;
  view: { phase: "idle" | "loading" | "ready" | "failed"; analysis: Analysis | null };
  overrides: AdvisorOverrides;
  onOverrides: (next: AdvisorOverrides) => void;
  selectedPlanId: PlanId | null;
  onSelectPlan: (id: PlanId) => void;
  onReview: () => void;
  narration?: AdvisorNarration;
}

/** Three-step analysis of a coach draft, the verdict, the plans; the form opens only when the customer asks. */
export function GoalAdvisorCard(p: GoalAdvisorCardProps) {
  const c = GOALS_COPY.advisor;
  const a = p.analysis;
  const steps = [
    { title: c.step1, text: understoodSentence(p.draft, monthsLeft(transferNow(), p.draft.targetDate)) },
    { title: c.step2, text: a ? cashflowSentence(a) : null },
    { title: c.step3, text: a ? verdictSentence(a) : null },
  ];
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <AnalysisSteps steps={steps} />
      {a && <VerdictCard analysis={a} narration={p.narration?.verdict} />}
      {a && (
        <PlanCompare
          draft={p.draft}
          view={p.view}
          overrides={p.overrides}
          onOverrides={p.onOverrides}
          selectedPlanId={p.selectedPlanId}
          onSelect={p.onSelectPlan}
          narration={p.narration}
        />
      )}
      {a && (
        <button type="button" className={`${primaryButton} w-full`} onClick={p.onReview}>
          {GOALS_COPY.coach.reviewAndCreate}
        </button>
      )}
    </section>
  );
}
