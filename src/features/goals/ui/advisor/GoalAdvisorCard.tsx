import type { Analysis, AnalyzeDraft } from "../../advisor/analysis-types";
import { cashflowSentence, understoodSentence, verdictSentence } from "../../advisor/templates";
import { monthsLeft } from "../../engine/months";
import { transferNow } from "@/lib/demo-clock";
import { GOALS_COPY } from "../copy";
import { primaryButton } from "../styles";
import { AnalysisSteps } from "./AnalysisSteps";
import { VerdictCard } from "./VerdictCard";

/** Three-step analysis of a coach draft, then the verdict; the form opens only when the customer asks. */
export function GoalAdvisorCard({
  draft,
  analysis,
  onReview,
}: {
  draft: AnalyzeDraft;
  analysis: Analysis | null;
  onReview: () => void;
}) {
  const c = GOALS_COPY.advisor;
  const steps = [
    { title: c.step1, text: understoodSentence(draft, monthsLeft(transferNow(), draft.targetDate)) },
    { title: c.step2, text: analysis ? cashflowSentence(analysis) : null },
    { title: c.step3, text: analysis ? verdictSentence(analysis) : null },
  ];
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <AnalysisSteps steps={steps} />
      {analysis && <VerdictCard analysis={analysis} />}
      {analysis && (
        <button type="button" className={`${primaryButton} w-full`} onClick={onReview}>
          {GOALS_COPY.coach.reviewAndCreate}
        </button>
      )}
    </section>
  );
}
