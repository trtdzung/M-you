// Pure: draft + AdvisorContext -> verdict, three plans, health impact and cautions.
import { assessFeasibility } from "../engine/feasibility";
import { monthsLeft } from "../engine/months";
import type { AdvisorContext } from "./types";
import type { Analysis, AnalyzeDraft, Caution, HealthImpact, Plan, PlanId, PlanInsight, Verdict } from "./analysis-types";
import { COMFORT_SHARE, extendDeadlinePlan, keepDeadlinePlan, reduceAmountPlan, type PlanBase } from "./plans";

const SAVING_TARGET = 0.1;
const MAX_OBLIGATION_CAUTIONS = 2;

function verdictOf(result: string, required: number, surplus: number | "unknown"): Verdict {
  if (result === "met") return "feasible";
  if (surplus === "unknown") return "unknown";
  if (surplus <= 0) return "not_feasible";
  if (required <= surplus * COMFORT_SHARE) return "feasible";
  return required <= surplus ? "stretch" : "not_feasible";
}

const band = (v: number, good: number, warn: number): 0 | 50 | 100 => (v >= good ? 100 : v >= warn ? 50 : 0);

function healthImpact(ctx: AdvisorContext, plan: Plan): HealthImpact[] {
  const out: HealthImpact[] = [];
  const h = ctx.health;
  if (ctx.avgIncome !== "unknown" && ctx.avgIncome > 0 && plan.available) {
    if (h.steadySaving.value !== null && h.steadySaving.score !== null) {
      const to = band(h.steadySaving.value + plan.monthly / ctx.avgIncome, SAVING_TARGET, Number.MIN_VALUE);
      if (to !== h.steadySaving.score) out.push({ metric: "steadySaving", from: h.steadySaving.score, to });
    }
    const cuts = plan.cuts.reduce((s, c) => s + c.perMonth, 0);
    if (cuts > 0 && h.spendRatio.value !== null && h.spendRatio.score !== null) {
      const ratio = Math.max(0, h.spendRatio.value - cuts / ctx.avgIncome);
      const to: 0 | 50 | 100 = ratio < 0.8 ? 100 : ratio <= 1 ? 50 : 0;
      if (to !== h.spendRatio.score) out.push({ metric: "spendRatio", from: h.spendRatio.score, to });
    }
  }
  if (plan.available && h.hasPlan.score === 0) out.push({ metric: "hasPlan", from: 0, to: 100 });
  return out;
}

function cautions(ctx: AdvisorContext, plan: Plan, surplus: number | "unknown"): Caution[] {
  const out: Caution[] = [];
  const due = ctx.signals.flatMap((s) => (s.kind === "upcoming_obligation" ? [s] : []))
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, MAX_OBLIGATION_CAUTIONS);
  for (const s of due) out.push({ kind: "obligation_due", label: s.label, amount: s.amount, daysLeft: s.daysLeft });
  for (const s of ctx.signals) if (s.kind === "cashflow_risk") out.push({ kind: "month_end_shortfall", projected: s.projectedEndOfMonth });
  if (plan.available && surplus !== "unknown" && surplus > 0) {
    const share = plan.monthly / surplus;
    if (share > COMFORT_SHARE) out.push({ kind: "tight_budget", shareOfSurplus: Math.round(share * 100) / 100 });
  }
  return out;
}

export function analyze(draft: AnalyzeDraft, ctx: AdvisorContext, now: Date): Analysis {
  const surplus = ctx.surplus;
  const feasibility = assessFeasibility({
    targetAmount: draft.targetAmount, currentAmount: draft.openingAmount, targetDate: draft.targetDate, now, surplus,
  });
  const base: PlanBase = { draft, now, months: feasibility.monthsLeft, surplus, ctx };
  const plans: Record<PlanId, Plan> = {
    keep_deadline: keepDeadlinePlan(base),
    extend_deadline: extendDeadlinePlan(base),
    reduce_amount: reduceAmountPlan(base),
  };
  const insights = Object.fromEntries(
    (Object.keys(plans) as PlanId[]).map((id): [PlanId, PlanInsight] => [
      id,
      { healthImpact: healthImpact(ctx, plans[id]), cautions: cautions(ctx, plans[id], surplus) },
    ]),
  ) as Record<PlanId, PlanInsight>;
  return {
    verdict: verdictOf(feasibility.result, feasibility.requiredMonthly, surplus),
    requiredMonthly: feasibility.requiredMonthly,
    monthsLeft: monthsLeft(now, draft.targetDate),
    surplus,
    gapMultiple: surplus !== "unknown" && surplus > 0 ? Math.round((feasibility.requiredMonthly / surplus) * 100) / 100 : null,
    plans,
    insights,
    provenance: { source: "mock", monthsUsed: ctx.monthsUsed, basis: "average_surplus" },
  };
}
