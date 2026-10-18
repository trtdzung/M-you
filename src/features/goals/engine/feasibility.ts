import type { GoalFeasibility } from "../model/types";
import { monthsLeft } from "./months";

export interface FeasibilityInput {
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  now: Date;
  surplus: number | "unknown";
}

/** Required monthly saving vs. average monthly surplus. Never defaults surplus to 0. */
export function assessFeasibility(input: FeasibilityInput): GoalFeasibility {
  const { targetAmount, currentAmount, targetDate, now, surplus } = input;
  const months = monthsLeft(now, targetDate);
  const base = { monthsLeft: months, surplus, source: "estimated" as const };

  if (currentAmount >= targetAmount) {
    return { ...base, requiredMonthly: 0, result: "met" };
  }
  const requiredMonthly = Math.ceil((targetAmount - currentAmount) / months);
  if (surplus === "unknown") return { ...base, requiredMonthly, result: "unknown" };
  const feasible = surplus > 0 && requiredMonthly <= surplus;
  return { ...base, requiredMonthly, result: feasible ? "feasible" : "infeasible" };
}
