import type { GoalFeasibility, GoalFlexibility, Lever } from "../../model/types";
import { cutCategoryLever, type CategoryAverage } from "./cut-category";
import { extendDateLever } from "./extend-date";
import { reduceAmountLever } from "./reduce-amount";

export interface BuildLeversInput {
  feasibility: GoalFeasibility;
  flexibility: GoalFlexibility;
  targetAmount: number;
  currentAmount: number;
  now: Date;
  categoryAverages: CategoryAverage[];
}

/** Levers only when infeasible with a positive surplus; fixed goals never get "extend date". */
export function buildLevers(input: BuildLeversInput): Lever[] {
  const { feasibility, flexibility, targetAmount, currentAmount, now, categoryAverages } = input;
  const { surplus } = feasibility;
  if (feasibility.result !== "infeasible" || surplus === "unknown" || surplus <= 0) return [];

  const levers: Lever[] = [];
  if (flexibility === "flexible") {
    levers.push(extendDateLever(targetAmount, currentAmount, surplus, now));
  }
  levers.push(reduceAmountLever(currentAmount, surplus, feasibility.monthsLeft));
  const cut = cutCategoryLever(feasibility.requiredMonthly, surplus, categoryAverages);
  if (cut) levers.push(cut);
  return levers;
}
