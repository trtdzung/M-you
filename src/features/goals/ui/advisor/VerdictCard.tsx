import type { Analysis, Verdict } from "../../advisor/analysis-types";
import { GOALS_COPY } from "../copy";
import { formatGoalMoney } from "../shared/format-goal-money";
import { SourceBadge } from "./SourceBadge";

const TONE: Record<Verdict, string> = {
  feasible: "bg-positive-soft",
  stretch: "bg-warning-soft",
  not_feasible: "bg-warning-soft",
  unknown: "bg-surface-muted",
};

/** The conclusion: verdict headline, the sentence, monthly need vs surplus, and the data source. */
export function VerdictCard({ analysis }: { analysis: Analysis }) {
  const c = GOALS_COPY.advisor;
  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-4 ${TONE[analysis.verdict]}`}>
      <p className="text-[16px] leading-6 font-semibold text-text">{c.verdict[analysis.verdict]}</p>
      <dl className="grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-muted">{GOALS_COPY.feasibility.required}</dt>
          <dd className="text-[16px] font-semibold tabular-nums text-text">{formatGoalMoney(analysis.requiredMonthly)}{GOALS_COPY.feasibility.perMonth}</dd>
        </div>
        <div>
          <dt className="text-muted">{GOALS_COPY.feasibility.surplus}</dt>
          <dd className="text-[16px] font-semibold tabular-nums text-text">
            {analysis.surplus === "unknown" ? c.unknownValue : `${formatGoalMoney(analysis.surplus)}${GOALS_COPY.feasibility.perMonth}`}
          </dd>
        </div>
      </dl>
      <SourceBadge months={analysis.provenance.monthsUsed} />
    </div>
  );
}
