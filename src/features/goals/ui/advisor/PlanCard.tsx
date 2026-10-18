import { Check } from "lucide-react";
import type { Plan } from "../../advisor/analysis-types";
import { cutSentence, planSummary } from "../../advisor/templates";
import { GOALS_COPY } from "../copy";
import { formatGoalMoney } from "../shared/format-goal-money";

/** One way to reach the goal. A radio: exactly one plan is selected at a time. */
export function PlanCard({ plan, selected, recommended, onSelect, narration }: { plan: Plan; selected: boolean; recommended: boolean; onSelect: () => void; narration?: string | null }) {
  const c = GOALS_COPY.advisor.plans;
  const details = [
    ...(plan.fundingFromIdle > 0 ? [c.fundingIdle(formatGoalMoney(plan.fundingFromIdle))] : []),
    ...plan.fundingFromJars.map((j) => c.fundingJar(j.label, formatGoalMoney(j.amount))),
    ...plan.cuts.map(cutSentence),
    ...(plan.cuts.length > 0 && !plan.cutsCoverGap ? [c.gapNotCovered] : []),
  ];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!plan.available}
      onClick={onSelect}
      className={`flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 ${selected ? "border-primary bg-surface-tint" : "border-border bg-surface hover:bg-surface-muted"}`}
    >
      <span className="flex items-center gap-2">
        <span className="text-[15px] font-semibold text-text">{c[plan.id]}</span>
        {recommended && plan.available && plan.needed && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-strong">{c.recommended}</span>}
        {selected && <Check size={16} className="ml-auto text-primary" aria-label={c.selected} />}
      </span>
      {plan.available ? (
        <>
          <span className="text-[14px] leading-6 text-text">{(plan.id === "keep_deadline" ? planSummary(plan) : narration ?? planSummary(plan))}</span>
          {details.length > 0 && (
            <ul className="list-disc pl-5 text-[13px] leading-5 text-muted">
              {details.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </>
      ) : (
        <span className="text-[13px] leading-5 text-muted">{plan.reason ? c.unavailable[plan.reason] : ""}</span>
      )}
    </button>
  );
}
