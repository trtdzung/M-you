import { transferNow } from "@/lib/demo-clock";
import type { AnalyzeDraft } from "../../advisor/analysis-types";
import type { AdvisorOverrides } from "../../client/hooks/use-goal-advisor";
import { monthsLeft, addMonthsToDate } from "../../engine/months";
import { todayVn } from "../../model/today";
import { GOALS_COPY } from "../copy";
import { formatGoalMoney } from "../shared/format-goal-money";
import { secondaryButton } from "../styles";

const MAX_MONTHS = 240;
const range = "w-full accent-primary";

/** Two sliders (time, amount) around the customer's goal; they only change the overrides. */
export function PlanSliders({
  draft,
  overrides,
  onChange,
  sentence,
  state,
}: {
  draft: AnalyzeDraft;
  overrides: AdvisorOverrides;
  onChange: (next: AdvisorOverrides) => void;
  /** Template sentence for the current position; null while recalculating. */
  sentence: string | null;
  state: "ready" | "loading" | "failed";
}) {
  const c = GOALS_COPY.advisor.sliders;
  const now = transferNow();
  const baseMonths = monthsLeft(now, draft.targetDate);
  const months = overrides.targetDate ? monthsLeft(now, overrides.targetDate) : baseMonths;
  const amount = overrides.targetAmount ?? draft.targetAmount;
  const step = draft.targetAmount >= 1_000_000_000 ? 5_000_000 : 1_000_000;
  const minAmount = Math.max(step, Math.floor((draft.targetAmount * 0.3) / step) * step);
  const maxAmount = Math.ceil((draft.targetAmount * 1.7) / step) * step;

  const set = (next: { months?: number; amount?: number }) => {
    const m = next.months ?? months;
    const a = next.amount ?? amount;
    const out: AdvisorOverrides = {};
    if (m !== baseMonths) out.targetDate = addMonthsToDate(todayVn(now), m);
    if (a !== draft.targetAmount) out.targetAmount = a;
    onChange(out);
  };
  const dirty = overrides.targetDate !== undefined || overrides.targetAmount !== undefined;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <h4 className="text-[13px] font-semibold text-text">{c.title}</h4>
      <label className="flex flex-col gap-1 text-[13px] text-muted">
        <span className="flex justify-between"><span>{c.months}</span><span className="font-semibold text-text">{c.monthsValue(months)}</span></span>
        <input type="range" className={range} min={1} max={Math.max(MAX_MONTHS, baseMonths)} step={1} value={months} onChange={(e) => set({ months: Number(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-muted">
        <span className="flex justify-between"><span>{c.amount}</span><span className="font-semibold text-text">{formatGoalMoney(amount)}</span></span>
        <input type="range" className={range} min={minAmount} max={maxAmount} step={step} value={Math.min(maxAmount, Math.max(minAmount, amount))} onChange={(e) => set({ amount: Number(e.target.value) })} />
      </label>
      <p role="status" className="text-[14px] leading-6 text-text">
        {state === "failed" ? c.failed : state === "loading" || sentence === null ? c.recalculating : sentence}
      </p>
      {dirty && <button type="button" className={secondaryButton} onClick={() => onChange({})}>{c.reset}</button>}
    </section>
  );
}
