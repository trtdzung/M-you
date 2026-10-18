import type { Analysis, PlanId } from "./analysis-types";

/** Plan to pre-select: keep the deadline unless the goal needs adjusting, then the gentlest available change. */
export function recommendedPlan(a: Analysis): PlanId {
  if (a.verdict !== "not_feasible") return "keep_deadline";
  if (a.plans.extend_deadline.available) return "extend_deadline";
  if (a.plans.reduce_amount.available) return "reduce_amount";
  return "keep_deadline";
}

/** The selected plan if it is still offered, else the recommended one. */
export function effectivePlan(a: Analysis, selected: PlanId | null): PlanId {
  return selected && a.plans[selected].available ? selected : recommendedPlan(a);
}
