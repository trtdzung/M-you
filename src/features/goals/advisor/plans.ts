// The three ways to close a gap: keep the date, push it out, or lower the amount. Pure.
import { addMonthsToKey, dateToMonthKey } from "@/domain/engine/types";
import { extendDateLever } from "../engine/levers/extend-date";
import { reduceAmountLever } from "../engine/levers/reduce-amount";
import type { AdvisorContext } from "./types";
import type { AnalyzeDraft, Plan, PlanCut, PlanFunding, SeriesPoint } from "./analysis-types";

/** A plan is comfortable when it takes at most this share of the monthly surplus. */
export const COMFORT_SHARE = 0.7;
const MAX_SERIES_POINTS = 120;
const CATEGORY_CUT_SHARE = 0.3;
const SAVINGS_BUFFER_MONTHS = 3;
const ROUND = 100_000;

const roundDown = (n: number) => Math.floor(n / ROUND) * ROUND;

export function buildSeries(now: Date, opening: number, lump: number, monthly: number, months: number, target: number): SeriesPoint[] {
  const base = dateToMonthKey(now);
  const stride = Math.max(1, Math.ceil(months / MAX_SERIES_POINTS));
  const points: SeriesPoint[] = [];
  for (let i = 0; i <= months; i += stride) {
    points.push({ monthKey: addMonthsToKey(base, i), amount: Math.min(target, opening + lump + monthly * i) });
  }
  if ((months % stride) !== 0) points.push({ monthKey: addMonthsToKey(base, months), amount: Math.min(target, opening + lump + monthly * months) });
  return points;
}

/** Spare money that could go in up front: idle cash/savings first, then jar balance beyond the jar's own budget. */
export function fundingSources(ctx: AdvisorContext): { idle: number; jars: PlanFunding[] } {
  const idleSignal = ctx.signals.find((s) => s.kind === "idle_cash");
  const idleCash = idleSignal && idleSignal.kind === "idle_cash" ? idleSignal.amount : 0;
  const spareSavings =
    ctx.balances.savings !== null && ctx.avgExpense !== "unknown"
      ? Math.max(0, ctx.balances.savings - SAVINGS_BUFFER_MONTHS * ctx.avgExpense)
      : 0;
  const jars = ctx.jars.flatMap((j) => {
    if (j.spendable === null) return [];
    const spare = roundDown(j.spendable - Math.max(j.limit ?? 0, j.spent));
    return spare > 0 ? [{ jarId: j.id, label: j.label, amount: spare }] : [];
  });
  return { idle: roundDown(idleCash + spareSavings), jars };
}

/** Cuts for `gap` VND/month: concrete signals first (spikes, new subscriptions), then a share of big flexible categories. */
export function buildCuts(ctx: AdvisorContext, gap: number): PlanCut[] {
  const cuts: PlanCut[] = [];
  let left = gap;
  const flexIds = new Set(ctx.cuttable.map((c) => c.categoryId));
  for (const s of ctx.signals) {
    if (left <= 0) break;
    if (s.kind === "spending_spike" && flexIds.has(s.categoryId)) {
      const perMonth = Math.min(s.current - s.previous, left);
      cuts.push({ categoryId: s.categoryId, label: s.label, perMonth, reason: "spike" });
      left -= perMonth;
    } else if (s.kind === "new_subscription") {
      const perMonth = Math.min(s.monthlyAmount, left);
      cuts.push({ categoryId: s.categoryId, label: s.label, perMonth, reason: "subscription" });
      left -= perMonth;
    }
  }
  for (const c of ctx.cuttable) {
    if (left <= 0) break;
    const already = cuts.filter((x) => x.categoryId === c.categoryId).reduce((s, x) => s + x.perMonth, 0);
    const perMonth = Math.min(left, Math.floor(c.average * CATEGORY_CUT_SHARE) - already);
    if (perMonth <= 0) continue;
    cuts.push({ categoryId: c.categoryId, label: c.label ?? null, perMonth, reason: "category" });
    left -= perMonth;
  }
  return cuts;
}

interface PlanBase {
  draft: AnalyzeDraft;
  now: Date;
  months: number;
  surplus: number | "unknown";
  ctx: AdvisorContext;
}

function skeleton(b: PlanBase, id: Plan["id"]): Plan {
  const remaining = Math.max(0, b.draft.targetAmount - b.draft.openingAmount);
  const monthly = Math.ceil(remaining / b.months);
  return {
    id, available: true, reason: null, needed: true, months: b.months, monthly,
    targetDate: b.draft.targetDate, targetAmount: b.draft.targetAmount,
    cuts: [], cutsCoverGap: true, fundingFromJars: [], fundingFromIdle: 0,
    series: buildSeries(b.now, b.draft.openingAmount, 0, monthly, b.months, b.draft.targetAmount),
  };
}

export function keepDeadlinePlan(b: PlanBase): Plan {
  const { draft, now, months, surplus, ctx } = b;
  const plan = skeleton(b, "keep_deadline");
  if (surplus === "unknown") return { ...plan, available: false, reason: "unknown_surplus", needed: false };
  const comfort = Math.floor(Math.max(0, surplus) * COMFORT_SHARE);
  if (plan.monthly <= comfort) return { ...plan, needed: false };

  // This lever changes one flexible spending group; no hypothetical upfront funding.
  const monthly = plan.monthly;
  const gap = Math.max(0, monthly - surplus);
  const candidates = ctx.cuttable.filter(c => c.label && c.average > 0)
    .map(c => ({ categoryId: c.categoryId, label: c.label ?? null, perMonth: Math.min(gap, Math.floor(c.average * CATEGORY_CUT_SHARE)), reason: "category" as const }))
    .filter(c => c.perMonth > 0).sort((a, b) => b.perMonth - a.perMonth);
  const cuts = candidates.slice(0, 1);
  return { ...plan, monthly, cuts, needed: gap > 0, cutsCoverGap: cuts.reduce((total, cut) => total + cut.perMonth, 0) >= gap,
    series: buildSeries(now, draft.openingAmount, 0, monthly, months, draft.targetAmount) };

}

export function extendDeadlinePlan(b: PlanBase): Plan {
  const { draft, now, months, surplus } = b;
  const plan = skeleton(b, "extend_deadline");
  if (draft.flexibility === "fixed") return { ...plan, available: false, reason: "fixed_goal" };
  if (surplus === "unknown") return { ...plan, available: false, reason: "unknown_surplus" };
  const comfort = Math.floor(surplus * COMFORT_SHARE);
  if (comfort <= 0) return { ...plan, available: false, reason: "no_surplus" };
  if (plan.monthly <= comfort) return { ...plan, needed: false };
  const lever = extendDateLever(draft.targetAmount, draft.openingAmount, comfort, now);
  const newMonths = Math.max(months, lever.months);
  const monthly = Math.ceil((draft.targetAmount - draft.openingAmount) / newMonths);
  return {
    ...plan, months: newMonths, monthly, targetDate: lever.newDate,
    series: buildSeries(now, draft.openingAmount, 0, monthly, newMonths, draft.targetAmount),
  };
}

export function reduceAmountPlan(b: PlanBase): Plan {
  const { draft, now, months, surplus } = b;
  const plan = skeleton(b, "reduce_amount");
  if (surplus === "unknown") return { ...plan, available: false, reason: "unknown_surplus" };
  const comfort = Math.floor(surplus * COMFORT_SHARE);
  if (comfort <= 0) return { ...plan, available: false, reason: "no_surplus" };
  if (plan.monthly <= comfort) return { ...plan, needed: false };
  const lever = reduceAmountLever(draft.openingAmount, comfort, months);
  if (lever.newTarget <= draft.openingAmount) return { ...plan, available: false, reason: "already_enough" };
  const monthly = Math.ceil((lever.newTarget - draft.openingAmount) / months);
  return {
    ...plan, targetAmount: lever.newTarget, monthly,
    series: buildSeries(now, draft.openingAmount, 0, monthly, months, lever.newTarget),
  };
}

export type { PlanBase };
