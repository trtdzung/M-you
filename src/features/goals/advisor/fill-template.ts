// Fill a sentence's placeholders with the engine's numbers. Unknown value -> null (caller keeps the local template).
import { formatGoalMoney } from "../ui/shared/format-goal-money";
import type { Analysis, PlanId } from "./analysis-types";
import { isSafeNarration, type Placeholder } from "./narration-contract";

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Values for `{placeholders}`; `planId` null = the verdict sentence. */
export function narrationValues(a: Analysis, planId: PlanId | null): Partial<Record<Placeholder, string>> {
  const plan = a.plans[planId ?? "keep_deadline"];
  const cut = plan.cuts.reduce((s, c) => s + c.perMonth, 0);
  return {
    monthly_needed: formatGoalMoney(planId ? plan.monthly : a.requiredMonthly),
    ...(a.surplus !== "unknown" && a.surplus > 0 ? { surplus: formatGoalMoney(a.surplus) } : {}),
    target_amount: formatGoalMoney(plan.targetAmount),
    new_date: dmy(plan.targetDate),
    new_amount: formatGoalMoney(plan.targetAmount),
    months: String(planId ? plan.months : a.monthsLeft),
    ...(cut > 0 ? { cut_amount: formatGoalMoney(cut) } : {}),
  };
}

export function fillTemplate(text: string, values: Partial<Record<Placeholder, string>>): string | null {
  if (!isSafeNarration(text)) return null;
  let missing = false;
  const out = text.replace(/\{([^{}]*)\}/g, (_, name: Placeholder) => {
    const v = values[name];
    if (v === undefined) missing = true;
    return v ?? "";
  });
  return missing ? null : out;
}
